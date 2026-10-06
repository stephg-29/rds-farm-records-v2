// Runs sync in the background and gives screens the phone's copy of the records.
//
// Sync runs when the app opens, when signal comes back, a moment after each
// save, and every minute while the app is on screen.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Row } from './db'
import { addRecord, editRecord, removeRecord, restoreRecord, saveAll, syncNow, type NewRecord, type RecordEdit, type SyncContext, type SyncResult } from './sync'

export type SyncState = {
  syncing: boolean
  online: boolean
  lastSyncedAt: Date | null
  // Set when the last try couldn't reach the server.
  offlineMessage: string | null
}

type SyncApi = {
  ctx: SyncContext
  state: SyncState
  syncNow(): void
  add(table: string, values: Row): Promise<string>
  edit(table: string, id: string, changes: Row, reason?: string): Promise<void>
  remove(table: string, id: string, reason?: string): Promise<void>
  restore(table: string, id: string, reason?: string): Promise<void>
  // Several records as one action: all saved, or none.
  saveAll(adds: NewRecord[], edits?: RecordEdit[]): Promise<string[]>
}

const SyncCtx = createContext<SyncApi | null>(null)

const AFTER_SAVE_MS = 1500
const EVERY_MS = 60_000

export function SyncProvider({ ctx, children }: { ctx: SyncContext; children: ReactNode }) {
  const [state, setState] = useState<SyncState>({
    syncing: false, online: navigator.onLine, lastSyncedAt: null, offlineMessage: null,
  })
  const running = useRef<Promise<void> | null>(null)
  const again = useRef(false)
  const soon = useRef<number | undefined>(undefined)

  const run = useCallback(() => {
    // One sync at a time; a request during a sync runs once more after it.
    if (running.current) { again.current = true; return }
    setState((s) => ({ ...s, syncing: true }))
    running.current = (async () => {
      let r: SyncResult
      do {
        again.current = false
        try {
          r = await syncNow(ctx)
        } catch (e) {
          r = { sent: 0, rejected: 0, offline: true, message: e instanceof Error ? e.message : String(e) }
        }
      } while (again.current && !r.offline)
      setState((s) => ({
        ...s,
        syncing: false,
        lastSyncedAt: !r.offline ? new Date() : s.lastSyncedAt,
        offlineMessage: r.offline ? r.message : null,
      }))
      running.current = null
    })()
  }, [ctx])

  const runSoon = useCallback(() => {
    window.clearTimeout(soon.current)
    soon.current = window.setTimeout(run, AFTER_SAVE_MS)
  }, [run])

  useEffect(() => {
    run()
    const online = () => { setState((s) => ({ ...s, online: true })); run() }
    const offline = () => setState((s) => ({ ...s, online: false }))
    const visible = () => { if (document.visibilityState === 'visible') run() }
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') run() }, EVERY_MS)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(soon.current)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [run])

  const api = useMemo<SyncApi>(() => {
    const after = <T,>(p: Promise<T>) => p.then((v) => { runSoon(); return v })
    return {
      ctx,
      state,
      syncNow: run,
      add: (table, values) => after(addRecord(ctx, table, values)),
      edit: (table, id, changes, reason) => after(editRecord(ctx, table, id, changes, reason)),
      remove: (table, id, reason) => after(removeRecord(ctx, table, id, reason)),
      restore: (table, id, reason) => after(restoreRecord(ctx, table, id, reason)),
      saveAll: (adds, edits) => after(saveAll(ctx, adds, edits)),
    }
  }, [ctx, state, run, runSoon])

  return <SyncCtx.Provider value={api}>{children}</SyncCtx.Provider>
}

export function useSync(): SyncApi {
  const api = useContext(SyncCtx)
  if (!api) throw new Error('useSync must be used inside SyncProvider')
  return api
}

// The records of one table on this phone, leaving out deleted ones unless asked.
// undefined while loading.
export function useTable<T extends Row = Row>(table: string, opts: { includeDeleted?: boolean } = {}): T[] | undefined {
  const { ctx } = useSync()
  return useLiveQuery(async () => {
    const rows = await ctx.db.rows.where('table').equals(table).toArray()
    return rows.map((r) => r.data as T).filter((d) => opts.includeDeleted || !d.deleted_at)
  }, [ctx, table, opts.includeDeleted])
}

// The last copy of a server-calculated view.
export function useView<T extends Row = Row>(name: string): T[] | undefined {
  const { ctx } = useSync()
  return useLiveQuery(async () => ((await ctx.db.meta.get(`view:${name}`))?.value as T[] | undefined) ?? [], [ctx, name])
}

// Changes waiting to send, and any the server turned down.
export function useOutbox() {
  const { ctx } = useSync()
  return useLiveQuery(async () => {
    const items = await ctx.db.outbox.where('userId').equals(ctx.userId).toArray()
    return { waiting: items.length, turnedDown: items.filter((i) => i.lastError) }
  }, [ctx])
}
