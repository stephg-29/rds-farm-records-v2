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
  // A person's own settings (only their row comes down).
  { name: 'user_preferences' },
  { name: 'profiles', key: 'user_id', stamped: false },
  { name: 'properties' },
  { name: 'paddocks' },
  { name: 'pick_lists' },
  { name: 'livestock_classes' },
  { name: 'contacts' },
  { name: 'mobs' },
  { name: 'stock_events' },
  { name: 'stock_event_lines' },
  { name: 'mob_location_changes' },
  { name: 'products' },
  { name: 'product_batches' },
  { name: 'chemical_ledger' },
  { name: 'treatments' },
  { name: 'treatment_items' },
  // Owners only: the database sends staff none.
  { name: 'record_prices' },
  // Written by the database (e.g. a sale inside a withhold); the app marks them read or resolved.
  { name: 'alerts' },
  { name: 'map_features' },
  { name: 'issues' },
  { name: 'attachments' },
  { name: 'attachment_links' },
  { name: 'jobs' },
  { name: 'job_paddocks' },
  { name: 'spray_records' },
  { name: 'spray_record_paddocks' },
  { name: 'spray_record_items' },
  { name: 'pasture_records' },
  { name: 'pasture_record_paddocks' },
  { name: 'pasture_record_items' },
  { name: 'feed_storage_sites' },
  { name: 'feed_items' },
  { name: 'feed_lots' },
  { name: 'rations' },
  { name: 'ration_items' },
  { name: 'ration_assignments' },
  { name: 'feeding_events' },
  { name: 'feed_ledger' },
  { name: 'joinings' },
  { name: 'pregnancy_tests' },
  { name: 'birth_markings' },
  { name: 'vehicles' },
  { name: 'vehicle_services' },
  { name: 'documents' },
  { name: 'readings' },
  { name: 'import_batches' },
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
  exists(table: string, key: string, id: string): Promise<{ ok: true; exists: boolean } | Failure>
  // Put a file in storage (overwriting is fine: same path, same file).
  upload(path: string, blob: Blob, mimeType: string): Promise<{ ok: true } | Failure>
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
    const turnedDown = queued.find((i) => i.op === 'update' && i.lastError && i.userId === ctx.userId)
    if (unsentInsert) {
      // Not on the server yet, so just change what will be sent.
      await db.outbox.update(unsentInsert.seq!, {
        patch: { ...unsentInsert.patch, ...changes },
        version: unsentInsert.version + 1,
        lastError: null,
      })
    } else if (turnedDown) {
      // Fix the change that was turned down rather than queueing behind it:
      // it and every later change to this record become one change.
      const later = queued.filter((i) => i.op === 'update' && i.userId === ctx.userId && i.seq! > turnedDown.seq!)
      const patch = [...later.sort((a, b) => a.seq! - b.seq!).map((i) => i.patch), changes]
        .reduce<Row>((acc, p) => ({ ...acc, ...p }), { ...turnedDown.patch })
      if (reason && isStamped(s)) patch.edit_reason = reason
      await db.outbox.bulkDelete(later.map((i) => i.seq!))
      // The reason stays until the next try, so further edits fold in too.
      await db.outbox.update(turnedDown.seq!, { patch, version: turnedDown.version + 1 })
    } else {
      const patch: Row = { ...changes }
      if (reason && isStamped(s)) patch.edit_reason = reason
      await db.outbox.add(queueItem(ctx, { table, id, op: 'update', patch, baseUpdatedAt: versionOf(local.server) }))
    }
    await rebuild(db, table, id)
  })
}

export type NewRecord = { table: string; values: Row }
export type RecordEdit = { table: string; id: string; changes: Row; reason?: string }

// Save several records as one action (e.g. a move: the move, the new
// location and any count adjustment). All of it saves, or none of it.
// Returns the new records' ids, in order.
export async function saveAll(ctx: SyncContext, adds: NewRecord[], edits: RecordEdit[] = []): Promise<string[]> {
  const { db } = ctx
  return db.transaction('rw', db.rows, db.outbox, async () => {
    const ids: string[] = []
    for (const a of adds) ids.push(await addRecord(ctx, a.table, a.values))
    for (const e of edits) await editRecord(ctx, e.table, e.id, e.changes, e.reason)
    return ids
  })
}

// Records are never really deleted: they're marked deleted and can be restored.
export function removeRecord(ctx: SyncContext, table: string, id: string, reason?: string) {
  return editRecord(ctx, table, id, { deleted_at: nowIso() }, reason)
}

export function restoreRecord(ctx: SyncContext, table: string, id: string, reason?: string) {
  return editRecord(ctx, table, id, { deleted_at: null }, reason)
}

// Drop an unsent change the server turned down (the person chose to).
// The record goes back to how the server has it, or disappears if it
// never reached the server.
export async function discardChange(ctx: SyncContext, seq: number) {
  const { db } = ctx
  await db.transaction('rw', db.rows, db.outbox, async () => {
    const item = await db.outbox.get(seq)
    if (!item || item.userId !== ctx.userId) return
    const drop = [item]
    if (item.op === 'insert') {
      // Unsent records that belong to it (e.g. the lines of a move) go too.
      const mine = await db.outbox.where('userId').equals(ctx.userId).toArray()
      const gone = new Set([item.id])
      for (let grew = true; grew;) {
        grew = false
        for (const i of mine) {
          if (i.op === 'insert' && !gone.has(i.id) && refersTo(i.patch, gone)) { gone.add(i.id); grew = true }
        }
      }
      drop.push(...mine.filter((i) => i.seq !== item.seq && gone.has(i.id)))
    }
    await db.outbox.bulkDelete(drop.map((i) => i.seq!))
    for (const d of drop) await rebuild(db, d.table, d.id)
  })
}

// Does a new record point at any of these ids (e.g. a line's stock_event_id)?
function refersTo(patch: Row, ids: Set<string>) {
  return Object.values(patch).some((v) => typeof v === 'string' && ids.has(v))
}

// ---- Sending ---------------------------------------------------------------

export async function push(ctx: SyncContext): Promise<SyncResult> {
  const { db, remote } = ctx
  const items = await db.outbox.where('userId').equals(ctx.userId).sortBy('seq')
  // Records with an earlier change the server turned down: later changes to
  // the same record wait, so they're never applied out of order.
  const blocked = new Set<string>()
  // New records that couldn't be saved: records pointing at them wait too,
  // rather than each failing on its own.
  const missing = new Set<string>()
  const result: SyncResult = { sent: 0, rejected: 0, offline: false, message: null }

  for (const item of items) {
    const rowKey = `${item.table}:${item.id}`
    if (blocked.has(rowKey)) continue
    const current = await db.outbox.get(item.seq!)
    if (!current) continue
    const s = tableSpec(current.table)
    if (current.op === 'insert' && refersTo(current.patch, missing)) {
      blocked.add(rowKey)
      missing.add(current.id)
      continue
    }

    let res: WriteResult
    // A file's record is only sent once the file itself is up.
    if (current.op === 'insert' && current.table === 'attachments') {
      const file = await db.files.get(current.id)
      if (file && !file.uploaded) {
        const up = await remote.upload(file.path, file.blob, file.mimeType)
        if (!up.ok) {
          if (up.offline) { result.offline = true; result.message = up.message; return result }
          result.rejected++
          result.message = up.message
          blocked.add(rowKey)
          missing.add(current.id)
          await db.outbox.update(current.seq!, { attempts: current.attempts + 1, lastError: up.message })
          continue
        }
        await db.files.update(file.id, { uploaded: true })
      }
    }
    if (current.op === 'insert') {
      res = await remote.insert(current.table, current.patch)
      if (!res.ok && res.code === '23505') {
        // Either an earlier try got through but the reply was lost (fine), or
        // it really is a duplicate of another record (turned down).
        const check = await remote.exists(current.table, keyOf(s), current.id)
        if (!check.ok) res = check
        else if (check.exists) res = { ok: true, row: null }
      }
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
      if (current.op === 'insert') missing.add(current.id)
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
