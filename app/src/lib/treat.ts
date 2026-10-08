// Building the records for a treatment (new or edited), following the ISC
// LPA livestock treatment record. Withhold dates are always treatment date +
// days (the last day under withhold), recalculated when the date changes.
import type { Row } from './db'
import type { NewRecord, RecordEdit } from './sync'
import { addDays } from './withholds'

export type TreatmentItemInput = {
  // Existing item id when editing.
  id?: string
  productId: string
  batchId: string | null
  doseRate: string
  weightKg: number | null
  route: string
  quantityUsed: number | null
  reason: string
  whpDays: number | null
  esiDays: number | null
  adverseReactions: string
  brokenNeedle: boolean
}

export type TreatmentInput = {
  // Existing treatment id when editing.
  id?: string
  date: string
  mobId: string
  propertyId: string | null
  paddockId: string | null
  headTreated: number
  description: string
  treatedByUserId: string | null
  treatedByName: string
  treatedByPhone: string
  equipmentCleaned: boolean | null
  equipmentCleanedBy: string
  notes: string
  items: TreatmentItemInput[]
  // How many were in the mob (for part treatments), and the part treatment this finishes.
  mobHead?: number | null
  followUpOf?: string | null
}

const blank = (s: string) => (s.trim() === '' ? null : s.trim())

function itemValues(t: TreatmentInput, i: TreatmentItemInput, treatmentId: string): Row {
  return {
    treatment_id: treatmentId,
    product_id: i.productId,
    batch_id: i.batchId,
    dose_rate: blank(i.doseRate),
    approx_live_weight_kg: i.weightKg,
    route: blank(i.route),
    quantity_used: i.quantityUsed,
    reason: blank(i.reason),
    whp_days: i.whpDays,
    esi_days: i.esiDays,
    whp_until: i.whpDays !== null ? addDays(t.date, i.whpDays) : null,
    esi_until: i.esiDays !== null ? addDays(t.date, i.esiDays) : null,
    adverse_reactions: blank(i.adverseReactions),
    broken_needle: i.brokenNeedle,
  }
}

function treatmentValues(t: TreatmentInput): Row {
  return {
    treatment_date: t.date,
    mob_id: t.mobId,
    property_id: t.propertyId,
    paddock_id: t.paddockId,
    head_treated: t.headTreated,
    livestock_description: blank(t.description),
    treated_by_user_id: t.treatedByUserId,
    treated_by_name: blank(t.treatedByName),
    treated_by_phone: blank(t.treatedByPhone),
    equipment_cleaned_calibrated: t.equipmentCleaned,
    equipment_cleaned_by: blank(t.equipmentCleanedBy),
    notes: blank(t.notes),
    ...(t.mobHead !== undefined ? { mob_head: t.mobHead } : {}),
    ...(t.followUpOf !== undefined ? { follow_up_of: t.followUpOf } : {}),
  }
}

// existingItems: the treatment's items now (when editing), to find removed ones.
export function treatmentPlan(t: TreatmentInput, existingItems: Row[] = [], reason?: string): { treatmentId: string; adds: NewRecord[]; edits: RecordEdit[] } {
  const adds: NewRecord[] = []
  const edits: RecordEdit[] = []
  const treatmentId = t.id ?? crypto.randomUUID()
  if (t.id) edits.push({ table: 'treatments', id: t.id, changes: treatmentValues(t), reason })
  else adds.push({ table: 'treatments', values: { id: treatmentId, ...treatmentValues(t) } })

  for (const i of t.items) {
    if (i.id) edits.push({ table: 'treatment_items', id: i.id, changes: itemValues(t, i, treatmentId), reason })
    else adds.push({ table: 'treatment_items', values: itemValues(t, i, treatmentId) })
  }
  const kept = new Set(t.items.map((i) => i.id).filter(Boolean))
  for (const old of existingItems) {
    if (!old.deleted_at && !kept.has(String(old.id))) {
      edits.push({ table: 'treatment_items', id: String(old.id), changes: { deleted_at: new Date().toISOString() }, reason })
    }
  }
  return { treatmentId, adds, edits }
}

// A product typed in that isn't in the chemical list yet ("not in the shed").
export function quickProduct(name: string, whpDays: number | null, esiDays: number | null): NewRecord & { id: string } {
  const id = crypto.randomUUID()
  return {
    id, table: 'products',
    values: { id, name: name.trim(), product_kind: 'animal_treatment', stock_unit: 'mL', label_whp_days: whpDays, label_esi_days: esiDays, track_stock: false },
  }
}

// Same chemical group as a recent treatment of this mob: suggest rotating.
export function rotationHint(groupOf: (productId: string) => string | null, history: { productId: string; date: string; name: string }[], productId: string): string | null {
  const g = groupOf(productId)
  if (!g) return null
  const last = history.find((h) => h.productId !== productId && groupOf(h.productId) === g) ?? history.find((h) => groupOf(h.productId) === g)
  return last ? `${last.name} (group ${g}) was used on ${last.date}. Same group, so consider rotating.` : null
}

// Treatments that covered only part of the mob (e.g. 18 of 20 mustered), with
// the head still to treat: the mob's head then, less those treated and any
// later "rest" treatments pointing back. Cleared by "not needed", or when the
// mob has no head left.
export type PartTreated = { treatment: Row; mobId: string; remaining: number; ofHead: number; products: string[] }
export function partTreated(treatments: Row[], items: Row[], mobHead: (mobId: string) => number, productName: (id: string) => string): PartTreated[] {
  const live = treatments.filter((t) => !t.deleted_at)
  const out: PartTreated[] = []
  for (const t of live) {
    const of = Number(t.mob_head ?? 0)
    if (!t.mob_id || !of || t.rest_not_needed || t.follow_up_of) continue
    const rest = live.filter((f) => f.follow_up_of === t.id).reduce((n, f) => n + Number(f.head_treated ?? 0), 0)
    const remaining = Math.min(of - Number(t.head_treated ?? 0) - rest, mobHead(String(t.mob_id)))
    if (remaining <= 0) continue
    const products = items.filter((i) => i.treatment_id === t.id && !i.deleted_at).map((i) => productName(String(i.product_id)))
    out.push({ treatment: t, mobId: String(t.mob_id), remaining, ofHead: of, products })
  }
  return out.sort((a, b) => String(b.treatment.treatment_date).localeCompare(String(a.treatment.treatment_date)))
}
