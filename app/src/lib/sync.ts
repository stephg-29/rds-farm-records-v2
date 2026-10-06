// Offline-first sync. Every change is saved on the phone first (rows + outbox),
// then sent to the farm's database when there's signal. Pulling brings down
// everyone else's changes. Nothing here talks to Supabase directly: that's
// the Remote (remote.ts), so the engine can be tested without a network.
import type { FarmDb, OutboxItem, Row } from './db'
import { getMeta, setMeta } from './db'

export type TableSpec = {
  name: string
  // Primary key column. Default 'id'.
  key?: string
  // Has the standard record columns (recorded_at, device_id, edit_reason,
  // edit_base_updated_at). Default true.
  stamped?: boolean
}

// Tables this phone keeps a copy of. Grows as each phase is built.
export const SYNCED_TABLES: TableSpec[] = [
  { name: 'farm_settings' },
  { name: 'profiles', key: 'user_id', stamped: false },
  { name: 'properties' },
  { name: 'paddocks' },
  { name: 'pick_lists' },
  { name: 'livestock_classes' },
  { name: 'contacts' },
]

// Views the server works out. The phone keeps the last copy it saw.
export const CACHED_VIEWS = ['farm_modules']

export type Failure = { ok: false; offline: boolean; code?: string; message: string }
export type PullResult = { ok: true; rows: Row[] } | Failure
export type WriteResult = { ok: true; row: Row | null } | Failure

export interface Remote {
  pull(table: string, key: string, since: string | null, offset: number, limit: number): Promise<PullResult>
  insert(table: string, row: Row): Promise<WriteResult>
  update(table: string, key: string, id: string, patch: Row): Promise<WriteResult>
  view(name: string): Promise<PullResult>
}

export type SyncContext = { db: FarmDb; remote: Remote; userId: string; deviceId: string }

export type SyncResult = {
  sent: number
  rejected: number
  offline: boolean
  message: string | null
}

const PAGE = 1000
// Re-pull a few minutes before the last change seen, so a save that was
// still finishing on the server when we last pulled isn't missed.
const OVERLAP_MS = 5 * 60 * 1000

const nowIso = () => new Date().toISOString()

export function tableSpec(table: string): TableSpec {
  const s = SYNCED_TABLES.find((t) => t.name === table)
  if (!s) throw new Error(`${table} is not a synced table`)
  return s
}
const keyOf = (s: TableSpec) => s.key ?? 'id'
const isStamped = (s: TableSpec) => s.stamped !== false
const versionOf = (row: Row | null): string | null =>
  row ? ((row.updated_at ?? row.created_at ?? null) as string | null) : null

// ---- Starting up -----------------------------------------------------------

// Gives this phone a device id, and clears another person's cached records
// when someone different signs in. (Sign-out is blocked while changes are
// unsent, so nobody's unsent work is lost here.)
export async function prepareForUser(db: FarmDb, userId: string): Promise<string> {
  let deviceId = await getMeta<string>(db, 'device_id')
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    await setMeta(db, 'device_id', deviceId)
  }
  const previous = await getMeta<string>(db, 'user_id')
  if (previous && previous !== userId) {
    await db.transaction('rw', db.rows, db.meta, async () => {
      await db.rows.clear()
      await db.meta.where('key').noneOf(['device_id']).delete()
    })
  }
  await setMeta(db, 'user_id', userId)
  return deviceId
}

// ---- Saving on the phone ---------------------------------------------------

// Rebuild what screens see for one record: the server copy with this
// phone's unsent changes laid on top, in order.
async function rebuild(db: FarmDb, table: string, id: string) {
  const items = await db.outbox.where('[table+id]').equals([table, id]).sortBy('seq')
  const existing = await db.rows.get([table, id])
  const server = existing?.server ?? null
  if (!server && items.length === 0) {
    await db.rows.delete([table, id])
    return
  }
  const data = items.reduce<Row>((acc, item) => ({ ...acc, ...item.patch }), { ...(server ?? {}) })
  await db.rows.put({ table, id, server, data, pending: items.length })
}

function queueItem(ctx: SyncContext, item: Pick<OutboxItem, 'table' | 'id' | 'op' | 'patch' | 'baseUpdatedAt'>): OutboxItem {
  return { ...item, userId: ctx.userId, version: 0, queuedAt: nowIso(), attempts: 0, lastError: null }
}

// Add a new record. Returns its id.
export async function addRecord(ctx: SyncContext, table: string, values: Row): Promise<string> {
  const s = tableSpec(table)
  const key = keyOf(s)
  const id = typeof values[key] === 'string' ? (values[key] as string) : crypto.randomUUID()
  const row: Row = { ...values, [key]: id }
  if (isStamped(s)) {
    row.recorded_at = nowIso()
    row.device_id = ctx.deviceId
  }
  const { db } = ctx
  await db.transaction('rw', db.rows, db.outbox, async () => {
    await db.outbox.add(queueItem(ctx, { table, id, op: 'insert', patch: row, baseUpdatedAt: null }))
    await rebuild(db, table, id)
  })
  return id
}

// Change a record. Always allowed; the server keeps every earlier version.
export async function editRecord(ctx: SyncContext, table: string, id: string, changes: Row, reason?: string) {
  const s = tableSpec(table)
  const { db } = ctx
  await db.transaction('rw', db.rows, db.outbox, async () => {
    const local = await db.rows.get([table, id])
    if (!local) throw new Error("That record isn't on this phone.")
    const queued = await db.outbox.where('[table+id]').equals([table, id]).toArray()
    const unsentInsert = queued.find((i) => i.op === 'insert' && i.userId === ctx.userId)
    if (unsentInsert) {
      // Not on the server yet, so just change what will be sent.
      await db.outbox.update(unsentInsert.seq!, {
        patch: { ...unsentInsert.patch, ...changes },
        version: unsentInsert.version + 1,
      })
    } else {
      const patch: Row = { ...changes }
      if (reason && isStamped(s)) patch.edit_reason = reason
      await db.outbox.add(queueItem(ctx, { table, id, op: 'update', patch, baseUpdatedAt: versionOf(local.server) }))
    }
    await rebuild(db, table, id)
  })
}

// Records are never really deleted: they're marked deleted and can be restored.
export function removeRecord(ctx: SyncContext, table: string, id: string, reason?: string) {
  return editRecord(ctx, table, id, { deleted_at: nowIso() }, reason)
}

export function restoreRecord(ctx: SyncContext, table: string, id: string, reason?: string) {
  return editRecord(ctx, table, id, { deleted_at: null }, reason)
}

// ---- Sending ---------------------------------------------------------------

export async function push(ctx: SyncContext): Promise<SyncResult> {
  const { db, remote } = ctx
  const items = await db.outbox.where('userId').equals(ctx.userId).sortBy('seq')
  // Records with an earlier change the server turned down: later changes to
  // the same record wait, so they're never applied out of order.
  const blocked = new Set<string>()
  const result: SyncResult = { sent: 0, rejected: 0, offline: false, message: null }

  for (const item of items) {
    const rowKey = `${item.table}:${item.id}`
    if (blocked.has(rowKey)) continue
    const current = await db.outbox.get(item.seq!)
    if (!current) continue
    const s = tableSpec(current.table)

    let res: WriteResult
    if (current.op === 'insert') {
      res = await remote.insert(current.table, current.patch)
      // Already there: an earlier try got through but the reply was lost.
      if (!res.ok && res.code === '23505') res = { ok: true, row: null }
    } else {
      const patch: Row = { ...current.patch }
      if (isStamped(s) && current.baseUpdatedAt) patch.edit_base_updated_at = current.baseUpdatedAt
      res = await remote.update(current.table, keyOf(s), current.id, patch)
    }

    if (!res.ok) {
      if (res.offline) {
        result.offline = true
        result.message = res.message
        return result
      }
      result.rejected++
      result.message = res.message
      blocked.add(rowKey)
      await db.outbox.update(current.seq!, { attempts: current.attempts + 1, lastError: res.message })
      continue
    }

    result.sent++
    const serverRow = res.row
    await db.transaction('rw', db.rows, db.outbox, async () => {
      const latest = await db.outbox.get(current.seq!)
      const newBase = versionOf(serverRow)
      if (latest && latest.version !== current.version) {
        // Edited while it was being sent: send the latest values as an edit.
        await db.outbox.update(current.seq!, { op: 'update', patch: latest.patch, version: 0, baseUpdatedAt: newBase, attempts: 0, lastError: null })
      } else {
        await db.outbox.delete(current.seq!)
      }
      if (serverRow) {
        // Later edits of this record were made on top of what was just sent.
        await db.outbox.where('[table+id]').equals([current.table, current.id])
          .modify((i) => { if (i.op === 'update') i.baseUpdatedAt = newBase })
        const local = await db.rows.get([current.table, current.id])
        await db.rows.put({ table: current.table, id: current.id, data: local?.data ?? serverRow, pending: local?.pending ?? 0, server: serverRow })
      }
      await rebuild(db, current.table, current.id)
    })
  }
  return result
}

// ---- Receiving -------------------------------------------------------------

export async function pull(ctx: SyncContext): Promise<SyncResult> {
  const { db, remote } = ctx
  const result: SyncResult = { sent: 0, rejected: 0, offline: false, message: null }

  for (const s of SYNCED_TABLES) {
    const key = keyOf(s)
    const cursorKey = `cursor:${s.name}`
    const cursor = await getMeta<string>(db, cursorKey)
    const since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null
    let newest = cursor ? Date.parse(cursor) : 0

    for (let offset = 0; ; offset += PAGE) {
      const res = await remote.pull(s.name, key, since, offset, PAGE)
      if (!res.ok) {
        result.offline = res.offline
        result.message = res.message
        return result
      }
      await db.transaction('rw', db.rows, db.outbox, async () => {
        for (const row of res.rows) {
          const id = String(row[key])
          const local = await db.rows.get([s.name, id])
          await db.rows.put({ table: s.name, id, server: row, data: row, pending: local?.pending ?? 0 })
          await rebuild(db, s.name, id)
        }
      })
      for (const row of res.rows) {
        for (const col of ['created_at', 'updated_at']) {
          const t = row[col] ? Date.parse(row[col] as string) : 0
          if (t > newest) newest = t
        }
      }
      if (res.rows.length < PAGE) break
    }
    if (newest) await setMeta(db, cursorKey, new Date(newest).toISOString())
  }

  for (const name of CACHED_VIEWS) {
    const res = await remote.view(name)
    if (!res.ok) {
      result.offline = res.offline
      result.message = res.message
      return result
    }
    await setMeta(db, `view:${name}`, res.rows)
  }
  return result
}

// Send this phone's changes, then bring down everyone else's.
export async function syncNow(ctx: SyncContext): Promise<SyncResult> {
  const sent = await push(ctx)
  if (sent.offline) return sent
  const pulled = await pull(ctx)
  return {
    sent: sent.sent,
    rejected: sent.rejected,
    offline: pulled.offline,
    message: pulled.message ?? sent.message,
  }
}
