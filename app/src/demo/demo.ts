// The built-in demo farm (Yarrabee Downs, made up). The real app, run on
// records kept only on this phone: no login, nothing is sent anywhere.
// The records come from scripts/build-demo-data.mjs (demoData.json), and
// every date in them is moved forward so the demo always looks current.
import type { FarmDb, LocalRow, Row } from '../lib/db'
import { getMeta, setMeta } from '../lib/db'
import { CACHED_VIEWS, SYNCED_TABLES, type Remote } from '../lib/sync'
import { todayLocal } from '../lib/stock'

export type DemoData = { builtOn: string; userId: string; tables: Record<string, Row[]>; views: Record<string, Row[]> }

export const DEMO_DB = 'farm-records-demo'
export const DEMO_PEOPLE = [
  { id: 'd0000000-0000-4000-8000-0000000001a1', label: 'Owner' },
  { id: 'd0000000-0000-4000-8000-0000000001a2', label: 'Staff' },
  { id: 'd0000000-0000-4000-8000-0000000001a3', label: 'Contractor' },
]

const DAY = 86_400_000
const DATE = /^\d{4}-\d{2}-\d{2}$/
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

export function daysFrom(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)
}

// One value moved on by some days (dates and times only; anything else as is).
function shiftValue(v: unknown, days: number): unknown {
  if (typeof v !== 'string') return v
  if (DATE.test(v)) return new Date(Date.parse(`${v}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
  if (STAMP.test(v)) {
    const t = Date.parse(v)
    return Number.isNaN(t) ? v : new Date(t + days * DAY).toISOString()
  }
  return v
}

export function shiftRow(row: Row, days: number): Row {
  if (days === 0) return row
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) out[k] = shiftValue(v, days)
  return out
}

const keyOf = (table: string) => SYNCED_TABLES.find((t) => t.name === table)?.key ?? 'id'

// Put the demo records on this phone, dated as of today.
export async function seedDemo(db: FarmDb, data: DemoData, today = todayLocal()) {
  const days = daysFrom(data.builtOn, today)
  const rows: LocalRow[] = []
  for (const [table, list] of Object.entries(data.tables)) {
    for (const r of list) {
      const row = shiftRow(r, days)
      rows.push({ table, id: String(row[keyOf(table)]), server: row, data: row, pending: 0 })
    }
  }
  await db.transaction('rw', db.rows, db.outbox, db.meta, db.files, async () => {
    await db.rows.clear()
    await db.outbox.clear()
    await db.files.clear()
    await db.meta.clear()
    await db.rows.bulkPut(rows)
    for (const name of CACHED_VIEWS) await setMeta(db, `view:${name}`, data.views[name] ?? [])
    await setMeta(db, 'device_id', crypto.randomUUID())
    await setMeta(db, 'demo:dated', today)
  })
}

// Opened on a later day: move everything (the demo's records and anything
// added since) forward, so withholds, reminders and grazing days stay current.
export async function bringDemoUpToDate(db: FarmDb, today = todayLocal()) {
  const dated = await getMeta<string>(db, 'demo:dated')
  if (!dated || dated === today) return
  const days = daysFrom(dated, today)
  await db.transaction('rw', db.rows, db.meta, async () => {
    const all = await db.rows.toArray()
    await db.rows.bulkPut(all.map((r) => ({ ...r, server: r.server && shiftRow(r.server, days), data: shiftRow(r.data, days) })))
    await setMeta(db, 'demo:dated', today)
  })
}

export async function demoReady(db: FarmDb): Promise<boolean> {
  return !!(await getMeta<string>(db, 'demo:dated'))
}

// Stands in for the farm's database: takes every change, sends nothing,
// and has nothing new to bring down.
export function demoRemote(db: FarmDb): Remote {
  const now = () => new Date().toISOString()
  return {
    async pull() { return { ok: true, rows: [] } },
    async insert(_table, row) { return { ok: true, row: { created_at: now(), ...row } } },
    async update(table, _key, id, patch) {
      const current = (await db.rows.get([table, id]))?.server ?? {}
      const { edit_base_updated_at: _base, ...rest } = patch
      return { ok: true, row: { ...current, ...rest, updated_at: now() } }
    },
    async view(name) { return { ok: true, rows: (await getMeta<Row[]>(db, `view:${name}`)) ?? [] } },
    async exists() { return { ok: true, exists: false } },
    async upload() { return { ok: true } },
  }
}
