// Withholds, worked out on the phone (so warnings work offline). Mirrors the
// database view mob_withholds: a treatment puts its mob under withhold until
// the last day (whp_until / esi_until), and the withhold follows stock
// through splits, merges, transfers and weaning into receiving mobs, unless
// the user chose not to apply it there.
import type { Row } from './db'

export type WithholdData = {
  treatments: Row[]
  items: Row[]
  products: Row[]
  events: Row[]
  lines: Row[]
}

export type Withhold = {
  mobId: string
  sourceId: string
  product: string
  whpUntil: string | null
  esiUntil: string | null
  // When this mob took it on (treatment date, or the split/merge date).
  from: string
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

// The last day of the withhold for an item: as stored, or treatment date + days.
export function itemUntil(item: Row, treatmentDate: string): { whp: string | null; esi: string | null } {
  const whp = item.whp_until ? String(item.whp_until) : item.whp_days !== null && item.whp_days !== undefined ? addDays(treatmentDate, Number(item.whp_days)) : null
  const esi = item.esi_until ? String(item.esi_until) : item.esi_days !== null && item.esi_days !== undefined ? addDays(treatmentDate, Number(item.esi_days)) : null
  return { whp, esi }
}

const CARRY = new Set(['split', 'merge', 'transfer_between_mobs', 'weaning'])

export function mobWithholds(d: WithholdData): Withhold[] {
  const treatments = new Map(d.treatments.filter((t) => !t.deleted_at).map((t) => [String(t.id), t]))
  const products = new Map(d.products.map((p) => [String(p.id), String(p.name)]))
  const events = new Map(d.events.filter((e) => !e.deleted_at).map((e) => [String(e.id), e]))
  const lines = d.lines.filter((l) => !l.deleted_at && events.has(String(l.stock_event_id)))

  const out: Withhold[] = []
  const seen = new Set<string>()
  const add = (w: Withhold) => {
    const k = `${w.mobId}|${w.sourceId}|${w.from}`
    if (seen.has(k)) return false
    seen.add(k)
    out.push(w)
    return true
  }

  for (const i of d.items) {
    const t = treatments.get(String(i.treatment_id))
    if (i.deleted_at || !t || !t.mob_id) continue
    const date = String(t.treatment_date)
    const { whp, esi } = itemUntil(i, date)
    if (!whp && !esi) continue
    add({ mobId: String(t.mob_id), sourceId: String(i.id), product: products.get(String(i.product_id)) ?? 'Unknown product', whpUntil: whp, esiUntil: esi, from: date })
  }

  // Carry through splits and merges, as far as they go.
  for (let n = 0; n < out.length; n++) {
    const w = out[n]
    const end = later(w.whpUntil, w.esiUntil)!
    for (const src of lines) {
      if (src.mob_id !== w.mobId || Number(src.head_change) >= 0) continue
      const e = events.get(String(src.stock_event_id))!
      const date = String(e.event_date)
      if (!CARRY.has(String(e.event_type)) || date < w.from || date > end) continue
      for (const dst of lines) {
        if (dst.stock_event_id !== e.id || Number(dst.head_change) <= 0 || dst.mob_id === w.mobId) continue
        if ((dst.withhold_choice ?? 'applied') !== 'applied') continue
        add({ ...w, mobId: String(dst.mob_id), from: date })
      }
    }
  }
  return out
}

export type ActiveWithhold = { whpUntil: string | null; esiUntil: string | null; products: string[] }

// Withholds still running on a day (default today), per mob.
export function activeWithholds(all: Withhold[], day: string): Map<string, ActiveWithhold> {
  const out = new Map<string, ActiveWithhold>()
  for (const w of all) {
    if (w.from > day) continue
    const whp = w.whpUntil && w.whpUntil >= day ? w.whpUntil : null
    const esi = w.esiUntil && w.esiUntil >= day ? w.esiUntil : null
    if (!whp && !esi) continue
    const a = out.get(w.mobId) ?? { whpUntil: null, esiUntil: null, products: [] }
    a.whpUntil = later(a.whpUntil, whp)
    a.esiUntil = later(a.esiUntil, esi)
    if (!a.products.includes(w.product)) a.products.push(w.product)
    out.set(w.mobId, a)
  }
  return out
}

// Would selling or slaughtering this mob on this day break a withhold?
// ESI applies to export and unknown markets (as the database's check does).
export function exitBreach(all: Withhold[], mobId: string, day: string, market: 'domestic' | 'export' | 'unknown'): Withhold | null {
  const hits = all.filter((w) => w.mobId === mobId && w.from <= day &&
    ((w.whpUntil && w.whpUntil >= day) || (market !== 'domestic' && w.esiUntil && w.esiUntil >= day)))
  return hits.sort((a, b) => (later(b.whpUntil, b.esiUntil)! > later(a.whpUntil, a.esiUntil)! ? 1 : -1))[0] ?? null
}
