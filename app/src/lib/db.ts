// The copy of the farm's records kept on this phone (IndexedDB, through Dexie).
//
// rows    every synced record, as the server last sent it with this phone's
//         unsent changes laid on top. Screens read from here, so they work
//         with no signal.
// outbox  changes made on this phone that the server hasn't accepted yet,
//         in the order they were made.
// meta    small settings: this phone's device id, who is signed in, and how
//         far each table has been pulled.
import Dexie, { type Table } from 'dexie'

export type Row = Record<string, unknown>

export type LocalRow = {
  table: string
  id: string
  // The record as the server last sent it (null until it has been sent).
  server: Row | null
  // What screens show: server copy plus this phone's unsent changes.
  data: Row
  // How many outbox changes for this row are still waiting to send.
  pending: number
}

export type OutboxItem = {
  seq?: number
  userId: string
  table: string
  id: string
  op: 'insert' | 'update'
  // insert: the whole new row. update: just the changed fields.
  patch: Row
  // Goes up when an edit is folded into an insert that hasn't sent yet.
  version: number
  // The updated_at of the copy that was edited, so the server can spot
  // two phones editing the same record offline.
  baseUpdatedAt: string | null
  queuedAt: string
  attempts: number
  // Set when the server turned the change down (not when there was no signal).
  lastError: string | null
}

export type Meta = { key: string; value: unknown }

export class FarmDb extends Dexie {
  declare rows: Table<LocalRow, [string, string]>
  declare outbox: Table<OutboxItem, number>
  declare meta: Table<Meta, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      rows: '[table+id], table',
      outbox: '++seq, [table+id], userId',
      meta: 'key',
    })
  }
}

// One local database per farm, so a phone used on two farms never mixes them.
export function openFarmDb(supabaseUrl: string): FarmDb {
  const ref = new URL(supabaseUrl).hostname.split('.')[0]
  return new FarmDb(`farm-records-${ref}`)
}

export async function getMeta<T>(db: FarmDb, key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(db: FarmDb, key: string, value: unknown) {
  await db.meta.put({ key, value })
}
