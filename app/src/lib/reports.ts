// Reports worked out on the phone: livestock reconciliation (mirrors the
// database function livestock_reconciliation) and the LPA registers for the
// audit pack. These are records of what was entered, not a compliance check.
import type { Row } from './db'
import { liveLines, type StockData } from './stock'

export type ReconRow = { species: string; className: string; opening: number; births: number; purchases: number; sales: number; deaths: number; other: number; closing: number }

export function reconciliation(s: StockData, classes: Row[], from: string, to: string): ReconRow[] {
  const mobs = new Map(s.mobs.map((m) => [String(m.id), m]))
  const className = (id: unknown) => (id ? String(classes.find((c) => c.id === id)?.name ?? '(unknown class)') : '(no class)')
  const rows = new Map<string, ReconRow>()
  for (const l of liveLines(s)) {
    const mob = mobs.get(String(l.mob_id))
    if (!mob) continue
    const species = String(mob.species)
    const cls = className(l.livestock_class_id)
    const key = `${species}|${cls}`
    const r = rows.get(key) ?? { species, className: cls, opening: 0, births: 0, purchases: 0, sales: 0, deaths: 0, other: 0, closing: 0 }
    const date = String(l.event.event_date)
    const type = String(l.event.event_type)
    const h = Number(l.head_change)
    // Starting counts are stock on hand when the farm began recording: opening.
    const starting = type === 'count_adjustment' && l.event.reason === 'opening_count'
    if (date < from || (starting && date <= to)) r.opening += h
    else if (date <= to) {
      if (type === 'birth_marking') r.births += h
      else if (type === 'arrival') r.purchases += h
      else if (type === 'exit') r.sales -= h
      else if (type === 'death') r.deaths -= h
      else r.other += h
    }
    if (date <= to) r.closing += h
    rows.set(key, r)
  }
  return [...rows.values()].sort((a, b) => a.species.localeCompare(b.species) || a.className.localeCompare(b.className))
}

// Australian financial year containing a date (1 July to 30 June).
export function financialYear(today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4))
  const start = today.slice(5) >= '07-01' ? y : y - 1
  return { from: `${start}-07-01`, to: `${start + 1}-06-30` }
}

// ---- CSV -------------------------------------------------------------------------

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
}

export function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---- LPA registers --------------------------------------------------------------------

export type TreatmentRow = { date: string; livestock: string; location: string; head: number | null; product: string; batch: string; expiry: string; dose: string; treatedBy: string; whpDays: string; esiDays: string; safeForSlaughter: string; adverse: string; edited: boolean }

export function treatmentRegister(d: { treatments: Row[]; items: Row[]; products: Row[]; batches: Row[]; paddocks: Row[]; mobName: (id: string) => string }, from: string, to: string): TreatmentRow[] {
  const out: TreatmentRow[] = []
  for (const t of d.treatments) {
    const date = String(t.treatment_date)
    if (t.deleted_at || date < from || date > to) continue
    for (const i of d.items.filter((x) => x.treatment_id === t.id && !x.deleted_at)) {
      const p = d.products.find((x) => x.id === i.product_id)
      const b = d.batches.find((x) => x.id === i.batch_id)
      const safe = i.whp_until ? new Date(Date.parse(`${i.whp_until}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : ''
      out.push({
        date, livestock: String(t.livestock_description ?? (t.mob_id ? d.mobName(String(t.mob_id)) : '')),
        location: String(d.paddocks.find((x) => x.id === t.paddock_id)?.name ?? ''), head: t.head_treated == null ? null : Number(t.head_treated),
        product: String(p?.name ?? ''), batch: String(b?.batch_number ?? '(not recorded)'), expiry: String(b?.expiry_date ?? ''),
        dose: [i.dose_rate, i.approx_live_weight_kg ? `${i.approx_live_weight_kg} kg` : null].filter(Boolean).join(' · '),
        treatedBy: [t.treated_by_name, t.treated_by_phone].filter(Boolean).join(' · '),
        whpDays: i.whp_days == null ? '' : String(i.whp_days), esiDays: i.esi_days == null ? '' : String(i.esi_days), safeForSlaughter: safe,
        adverse: [i.adverse_reactions, i.broken_needle ? 'Broken needle' : null].filter(Boolean).join(' · '), edited: !!(t.updated_at || i.updated_at),
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export type MovementRow = { date: string; direction: 'On' | 'Off' | 'Between own properties'; head: number; livestock: string; fromPic: string; toPic: string; counterparty: string; nvd: string; nlis: string; reason: string; review: boolean }

export function movementRegister(s: StockData, d: { properties: Row[]; contacts: Row[]; classes: Row[] }, from: string, to: string): MovementRow[] {
  const pic = (id: unknown) => { const p = d.properties.find((x) => x.id === id); return p ? `${p.name}${p.pic ? ` (${p.pic})` : ''}` : '' }
  const who = (id: unknown) => { const c = d.contacts.find((x) => x.id === id); return c ? `${c.name}${c.pic ? ` (${c.pic})` : ''}` : '' }
  const lines = liveLines(s)
  const out: MovementRow[] = []
  for (const e of s.events) {
    const date = String(e.event_date)
    if (e.deleted_at || date < from || date > to) continue
    const type = String(e.event_type)
    const crossing = type === 'paddock_move' && e.from_property_id && e.to_property_id && e.from_property_id !== e.to_property_id
    if (type !== 'arrival' && type !== 'exit' && !crossing) continue
    const mine = lines.filter((l) => l.stock_event_id === e.id)
    const mobIds = crossing ? s.locations.filter((c) => c.stock_event_id === e.id).map((c) => String(c.mob_id)) : mine.map((l) => String(l.mob_id))
    // Imported history has no count lines; its head is kept as counted_head.
    const head = crossing || mine.length === 0 ? Number(e.counted_head ?? e.expected_head ?? 0) : Math.abs(mine.reduce((n, l) => n + Number(l.head_change), 0))
    const classNames = [...new Set(mine.map((l) => String(d.classes.find((c) => c.id === l.livestock_class_id)?.name ?? '')).filter(Boolean))]
    const mobNames = [...new Set(mobIds.map((id) => String(s.mobs.find((m) => m.id === id)?.name ?? '')))]
    out.push({
      date, direction: type === 'arrival' ? 'On' : type === 'exit' ? 'Off' : 'Between own properties', head,
      livestock: [mobNames.join(', '), classNames.join(', ')].filter(Boolean).join(' · '),
      fromPic: type === 'arrival' ? who(e.counterparty_contact_id) : pic(e.from_property_id),
      toPic: type === 'exit' ? who(e.counterparty_contact_id) : pic(e.to_property_id),
      counterparty: who(e.counterparty_contact_id), nvd: String(e.nvd_number ?? ''), nlis: String(e.nlis_transfer_status ?? ''),
      reason: String(e.reason ?? ''), review: !!e.needs_review,
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
