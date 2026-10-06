// Reminders worked out on the phone, matching the database's reminders view
// for stock and chemicals: withholds ending, recounts, NLIS transfers to do,
// mobs below zero, batches expiring, and chemicals needing a stocktake.
import type { Row } from './db'
import type { ProductView } from './chem'
import { openRecounts, type StockData } from './stock'
import type { ActiveWithhold } from './withholds'
import { addDays } from './withholds'

export type Reminder = { kind: string; date: string; text: string; detail?: string; path: string; tone: 'alert' | 'warn' | 'info' }

export function reminders(a: {
  today: string
  stock: StockData
  mobs: { id: string; name: string; head: number }[]
  active: Map<string, ActiveWithhold>
  chem: ProductView[]
  // Phase 4 records (optional so older callers still work).
  vehicles?: Row[]
  services?: Row[]
  documents?: Row[]
  joinings?: Row[]
  feed?: { id: string; name: string; daysLeft: number | null }[]
}): Reminder[] {
  const out: Reminder[] = []
  const soon = addDays(a.today, 14)
  const name = (id: string) => a.mobs.find((m) => m.id === id)?.name ?? 'A mob'

  for (const [mobId, w] of a.active) {
    const end = [w.whpUntil, w.esiUntil].filter(Boolean).sort().at(-1)!
    if (end <= soon) out.push({ kind: 'withhold_ending', date: addDays(end, 1), text: `${name(mobId)} clear of withhold`, detail: w.products.join(', '), path: `/stock/${mobId}`, tone: 'info' })
  }
  for (const m of a.mobs) {
    const r = openRecounts(a.stock, m.id)
    if (r.length > 0) out.push({ kind: 'recount', date: String(r[0].event_date), text: `Recount ${m.name}`, detail: `Book ${r[0].expected_head}, counted ${r[0].counted_head}`, path: `/stock/${m.id}/count`, tone: 'warn' })
    if (m.head < 0) out.push({ kind: 'below_zero', date: a.today, text: `${m.name} is below zero`, detail: 'Do a count', path: `/stock/${m.id}/count`, tone: 'alert' })
  }
  for (const e of a.stock.events as Row[]) {
    if (e.deleted_at || e.nlis_transfer_status !== 'to_do') continue
    const line = a.stock.lines.find((l) => l.stock_event_id === e.id && !l.deleted_at)
    out.push({ kind: 'nlis_to_do', date: String(e.event_date), text: 'NLIS transfer to do', detail: line ? name(String(line.mob_id)) : undefined, path: line ? `/stock/${line.mob_id}/record/${e.id}` : '/stock', tone: 'warn' })
  }
  for (const p of a.chem) {
    if (p.needsStocktake) out.push({ kind: 'stocktake', date: a.today, text: `${p.name} is below zero`, detail: 'Do a stocktake', path: `/records/chemicals/${p.id}`, tone: 'alert' })
    for (const b of p.batches) {
      if (b.onHand > 0 && b.expiringSoon && b.expiry) out.push({ kind: 'batch_expiring', date: b.expiry, text: `${p.name} batch ${b.batchNumber ?? ''} ${b.expired ? 'expired' : 'expires'}`.replace('  ', ' '), path: `/records/chemicals/${p.id}`, tone: b.expired ? 'alert' : 'warn' })
    }
  }
  // Vehicle services due within 14 days (from each vehicle's latest service).
  for (const v of a.vehicles ?? []) {
    if (v.archived_at) continue
    const last = (a.services ?? []).filter((s) => s.vehicle_id === v.id).sort((x, y) => String(y.service_date).localeCompare(String(x.service_date)))[0]
    if (last?.next_due_date && String(last.next_due_date) <= soon) out.push({ kind: 'vehicle', date: String(last.next_due_date), text: `${v.name} service due`, path: `/records/vehicles/${v.id}`, tone: String(last.next_due_date) < a.today ? 'alert' : 'warn' })
  }
  const month = addDays(a.today, 30)
  for (const d of a.documents ?? []) {
    if (d.review_due && String(d.review_due) <= month) out.push({ kind: 'document', date: String(d.review_due), text: `Review: ${d.title}`, path: `/records/documents/${d.id}`, tone: String(d.review_due) < a.today ? 'alert' : 'info' })
  }
  for (const j of a.joinings ?? []) {
    const start = j.expected_birth_start ? String(j.expected_birth_start) : null
    if (start && start >= a.today && start <= month) out.push({ kind: 'births', date: start, text: `${name(String(j.mob_id))}: due to start calving/lambing`, path: `/records/breeding/joinings/${j.id}`, tone: 'info' })
  }
  for (const f of a.feed ?? []) {
    if (f.daysLeft !== null && f.daysLeft < 14) out.push({ kind: 'feed', date: a.today, text: `${f.name}: ${f.daysLeft} days left`, detail: 'At current rations', path: `/records/feed/items/${f.id}`, tone: f.daysLeft < 7 ? 'alert' : 'warn' })
  }
  return out.sort((x, y) => x.date.localeCompare(y.date))
}
