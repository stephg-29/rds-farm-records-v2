// Feed on the phone. Mirrors the database views: on hand from the feed ledger
// (per lot and storage site), daily use from rations assigned today, and days
// left = on hand / use per day. A ration item is an amount each feed, every
// feed_every_days days: kg per head, or whole units (e.g. 2 round bales) to
// the mob.
import type { Row } from './db'
import type { NewRecord } from './sync'

export type FeedData = { items: Row[]; lots: Row[]; ledger: Row[]; sites: Row[]; rations: Row[]; rationItems: Row[]; assignments: Row[]; feedings?: Row[] }

export const kgPerUnit = (item: Row) => (item.unit === 't' ? 1000 : item.unit === 'kg' ? 1 : Number(item.kg_per_unit ?? 0) || null)

export const UNIT_LABEL: Record<string, [string, string]> = {
  round_bale: ['round bale', 'round bales'], square_bale: ['square bale', 'square bales'], t: ['t', 't'], kg: ['kg', 'kg'],
}
export const fmtFeed = (n: number, unit: string) => {
  const r = Math.round(n * 10) / 10
  const [one, many] = UNIT_LABEL[unit] ?? [unit, unit]
  return `${r.toLocaleString('en-AU')} ${Math.abs(r) === 1 ? one : many}`
}

export type LotView = { id: string; row: Row; itemId: string; onHand: number; bySite: Map<string | null, number> }
export type FeedItemView = {
  id: string; row: Row; name: string; unit: string; onHand: number; onHandKg: number | null
  kgPerDay: number; daysLeft: number | null; lots: LotView[]
}

const live = (r: Row) => !r.deleted_at

export type Basis = 'kg_per_head' | 'units_per_mob'
export const basisOf = (ri: Row): Basis => (ri.amount_basis === 'units_per_mob' ? 'units_per_mob' : 'kg_per_head')
export const everyOf = (ration: Row | undefined) => Math.max(1, Number(ration?.feed_every_days ?? 1) || 1)
// The amount each feed (kg per head, or units to the mob).
export function amountEachFeed(ri: Row, ration: Row | undefined): number {
  if (ri.amount !== null && ri.amount !== undefined) return Number(ri.amount)
  return Number(ri.kg_per_head_per_day ?? 0) * everyOf(ration)
}
// Use per day in the feed's own unit (bales, t or kg); null when bales have no
// kg per bale set and the ration is in kg.
function unitsPerDay(ri: Row, ration: Row | undefined, item: Row | undefined, head: number): number | null {
  const each = amountEachFeed(ri, ration) / everyOf(ration)
  if (basisOf(ri) === 'units_per_mob') return each
  const kpu = item ? kgPerUnit(item) : null
  return kpu ? (each * head) / kpu : null
}

export function feedStock(d: FeedData, heads: Map<string, number>, today: string): FeedItemView[] {
  // A deleted feeding gives its feed back (the database does the same).
  const goneFeedings = new Set((d.feedings ?? []).filter((f) => f.deleted_at).map((f) => String(f.id)))
  const lots = d.lots.filter(live).map<LotView>((lot) => {
    const bySite = new Map<string | null, number>()
    let onHand = 0
    for (const l of d.ledger) {
      if (!live(l) || l.feed_lot_id !== lot.id || (l.feeding_event_id && goneFeedings.has(String(l.feeding_event_id)))) continue
      const q = Number(l.quantity)
      onHand += q
      const site = l.storage_site_id ? String(l.storage_site_id) : null
      bySite.set(site, (bySite.get(site) ?? 0) + q)
    }
    return { id: String(lot.id), row: lot, itemId: String(lot.feed_item_id), onHand: Math.round(onHand * 1000) / 1000, bySite }
  })

  // Use per day for each feed item (in its unit), from rations assigned today.
  const perDay = new Map<string, number>()
  const unknown = new Set<string>()
  for (const a of d.assignments) {
    if (!live(a) || String(a.start_date) > today || (a.end_date && String(a.end_date) < today)) continue
    const head = Math.max(0, heads.get(String(a.mob_id)) ?? 0)
    const ration = d.rations.find((r) => r.id === a.ration_id)
    for (const ri of d.rationItems) {
      if (!live(ri) || ri.ration_id !== a.ration_id) continue
      const k = String(ri.feed_item_id)
      const u = unitsPerDay(ri, ration, d.items.find((i) => i.id === ri.feed_item_id), head)
      if (u === null) unknown.add(k)
      else perDay.set(k, (perDay.get(k) ?? 0) + u)
    }
  }

  return d.items.filter((i) => live(i) && !i.archived_at).map((i) => {
    const mine = lots.filter((l) => l.itemId === i.id)
    const onHand = Math.round(mine.reduce((n, l) => n + l.onHand, 0) * 1000) / 1000
    const kpu = kgPerUnit(i)
    const onHandKg = kpu ? onHand * kpu : null
    const usePerDay = perDay.get(String(i.id)) ?? 0
    // In a ration but bales have no kg set: days left can't be worked out.
    const blocked = unknown.has(String(i.id))
    const kgPerDay = kpu ? usePerDay * kpu : blocked ? 1 : 0
    return {
      id: String(i.id), row: i, name: String(i.name), unit: String(i.unit), onHand, onHandKg, kgPerDay,
      daysLeft: usePerDay > 0 && !blocked ? Math.floor(Math.max(0, onHand) / usePerDay) : null,
      lots: mine,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

// The ration a mob is on today.
export function currentRation(d: FeedData, mobId: string, today: string): Row | null {
  const a = d.assignments.filter((x) => live(x) && x.mob_id === mobId && String(x.start_date) <= today && (!x.end_date || String(x.end_date) >= today))
    .sort((x, y) => String(y.start_date).localeCompare(String(x.start_date)))[0]
  return a ? d.rations.find((r) => r.id === a.ration_id) ?? null : null
}

export type FeedLine = { itemId: string; lotId: string; siteId: string | null; quantity: number }

export const isBales = (unit: string) => unit === 'round_bale' || unit === 'square_bale'

// What one feed of the ration uses, in each item's unit, from the oldest lot
// that has some. Bales are suggested whole (a mob rarely gets part of one).
export function suggestFeeding(d: FeedData, stock: FeedItemView[], rationId: string, head: number): FeedLine[] {
  const ration = d.rations.find((r) => r.id === rationId)
  return d.rationItems.filter((ri) => live(ri) && ri.ration_id === rationId).map((ri) => {
    const item = stock.find((s) => s.id === ri.feed_item_id)
    const kpu = item ? kgPerUnit(item.row) : null
    const each = amountEachFeed(ri, ration)
    let quantity = basisOf(ri) === 'units_per_mob' ? each : kpu ? (each * head) / kpu : each * head
    quantity = item && isBales(item.unit) ? (quantity > 0 ? Math.max(1, Math.round(quantity)) : 0) : Math.round(quantity * 100) / 100
    const lot = item?.lots.filter((l) => l.onHand > 0).sort((a, b) => String(a.row.received_date).localeCompare(String(b.row.received_date)))[0] ?? item?.lots[0]
    const site = lot ? [...lot.bySite].find(([, q]) => q > 0)?.[0] ?? null : null
    return { itemId: String(ri.feed_item_id), lotId: lot?.id ?? '', siteId: site, quantity }
  })
}

// Move feed from one storage site to another (e.g. it was put in the wrong shed).
export function moveFeedPlan(lotId: string, from: string | null, to: string | null, quantity: number, date: string): NewRecord[] {
  const q = Math.abs(quantity)
  return [
    { table: 'feed_ledger', values: { feed_lot_id: lotId, storage_site_id: from, entry_date: date, entry_type: 'moved_between_sites', quantity: -q } },
    { table: 'feed_ledger', values: { feed_lot_id: lotId, storage_site_id: to, entry_date: date, entry_type: 'moved_between_sites', quantity: q } },
  ]
}

export function feedingPlan(f: { mobId: string; date: string; rationId: string | null; head: number; paddockId: string | null; notes: string | null; lines: FeedLine[] }): NewRecord[] {
  const id = crypto.randomUUID()
  return [
    { table: 'feeding_events', values: { id, feed_date: f.date, mob_id: f.mobId, ration_id: f.rationId, head_fed: f.head, paddock_id: f.paddockId, notes: f.notes } },
    ...f.lines.filter((l) => l.lotId && l.quantity > 0).map((l) => ({ table: 'feed_ledger', values: {
      feed_lot_id: l.lotId, storage_site_id: l.siteId, entry_date: f.date, entry_type: 'fed_out', quantity: -Math.abs(l.quantity), feeding_event_id: id,
    } })),
  ]
}
