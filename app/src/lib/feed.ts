// Feed on the phone. Mirrors the database views: on hand from the feed ledger
// (per lot and storage site), daily use from rations assigned today times
// current head, and days left = kg on hand / kg per day.
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

  // kg per day for each feed item, from rations assigned today.
  const perDay = new Map<string, number>()
  for (const a of d.assignments) {
    if (!live(a) || String(a.start_date) > today || (a.end_date && String(a.end_date) < today)) continue
    const head = Math.max(0, heads.get(String(a.mob_id)) ?? 0)
    for (const ri of d.rationItems) {
      if (!live(ri) || ri.ration_id !== a.ration_id) continue
      perDay.set(String(ri.feed_item_id), (perDay.get(String(ri.feed_item_id)) ?? 0) + Number(ri.kg_per_head_per_day) * head)
    }
  }

  return d.items.filter((i) => live(i) && !i.archived_at).map((i) => {
    const mine = lots.filter((l) => l.itemId === i.id)
    const onHand = Math.round(mine.reduce((n, l) => n + l.onHand, 0) * 1000) / 1000
    const kpu = kgPerUnit(i)
    const onHandKg = kpu ? onHand * kpu : null
    const kgPerDay = perDay.get(String(i.id)) ?? 0
    return {
      id: String(i.id), row: i, name: String(i.name), unit: String(i.unit), onHand, onHandKg, kgPerDay,
      daysLeft: kgPerDay > 0 && onHandKg !== null ? Math.floor(Math.max(0, onHandKg) / kgPerDay) : null,
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

// What a feeding would use: ration kg/head/day x head, in each item's unit,
// from the oldest lot that has some.
export function suggestFeeding(d: FeedData, stock: FeedItemView[], rationId: string, head: number): FeedLine[] {
  return d.rationItems.filter((ri) => live(ri) && ri.ration_id === rationId).map((ri) => {
    const item = stock.find((s) => s.id === ri.feed_item_id)
    const kpu = item ? kgPerUnit(item.row) : null
    const kg = Number(ri.kg_per_head_per_day) * head
    const lot = item?.lots.filter((l) => l.onHand > 0).sort((a, b) => String(a.row.received_date).localeCompare(String(b.row.received_date)))[0] ?? item?.lots[0]
    const site = lot ? [...lot.bySite].find(([, q]) => q > 0)?.[0] ?? null : null
    return { itemId: String(ri.feed_item_id), lotId: lot?.id ?? '', siteId: site, quantity: kpu ? Math.round((kg / kpu) * 100) / 100 : kg }
  })
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
