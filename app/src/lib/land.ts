// Spray, pasture and fertiliser records: building the records to save, and
// a paddock's history. Grazing/harvest withholds are spray date + the
// longest WHP in the mix (the last day not to graze), as the database does.
import type { Row } from './db'
import type { NewRecord, RecordEdit } from './sync'
import { addDays } from './withholds'

export type SprayItemInput = {
  id?: string
  productId: string | null
  // For a product not in the farm's list (e.g. the contractor's own).
  productName: string | null
  batchId: string | null
  batchNumber: string | null
  expiryDate: string | null
  rate: string
  quantityUsed: number | null
  grazingWhpDays: number | null
  harvestWhpDays: number | null
}

export type SprayInput = {
  id?: string
  date: string
  startTime: string
  finishTime: string
  propertyId: string | null
  paddockIds: string[]
  situation: string
  target: string
  waterRate: string
  areaHa: number | null
  wind: string
  temperatureC: number | null
  humidity: string
  equipment: string
  applicatorUserId: string | null
  applicatorName: string
  licence: string
  jobId: string | null
  contractorEntered: boolean
  notes: string
  items: SprayItemInput[]
}

const blank = (s: string) => (s.trim() === '' ? null : s.trim())
const latest = (date: string, days: (number | null)[]) => {
  const d = days.filter((x): x is number => x !== null)
  return d.length ? addDays(date, Math.max(...d)) : null
}

// Replace a record's set of linked rows (paddocks): add new, delete removed.
export function linkEdits(table: string, parentKey: string, parentId: string, otherKey: string, wanted: string[], existing: Row[]): { adds: NewRecord[]; edits: RecordEdit[] } {
  const now = existing.filter((l) => l[parentKey] === parentId && !l.deleted_at)
  return {
    adds: wanted.filter((w) => !now.some((l) => l[otherKey] === w)).map((w) => ({ table, values: { [parentKey]: parentId, [otherKey]: w } })),
    edits: now.filter((l) => !wanted.includes(String(l[otherKey]))).map((l) => ({ table, id: String(l.id), changes: { deleted_at: new Date().toISOString() } })),
  }
}

export function sprayPlan(s: SprayInput, existing: { paddocks: Row[]; items: Row[] } = { paddocks: [], items: [] }, reason?: string): { id: string; adds: NewRecord[]; edits: RecordEdit[] } {
  const id = s.id ?? crypto.randomUUID()
  const values: Row = {
    spray_date: s.date, start_time: blank(s.startTime), finish_time: blank(s.finishTime), property_id: s.propertyId,
    situation: blank(s.situation), target: blank(s.target), water_rate: blank(s.waterRate), area_ha: s.areaHa,
    wind_speed_direction: blank(s.wind), temperature_c: s.temperatureC, humidity_delta_t: blank(s.humidity), equipment: blank(s.equipment),
    applicator_user_id: s.applicatorUserId, applicator_name: blank(s.applicatorName), licence_number: blank(s.licence),
    grazing_withhold_until: latest(s.date, s.items.map((i) => i.grazingWhpDays)),
    harvest_withhold_until: latest(s.date, s.items.map((i) => i.harvestWhpDays)),
    job_id: s.jobId, contractor_entered: s.contractorEntered, notes: blank(s.notes),
  }
  const adds: NewRecord[] = []
  const edits: RecordEdit[] = []
  if (s.id) edits.push({ table: 'spray_records', id, changes: values, reason })
  else adds.push({ table: 'spray_records', values: { id, ...values } })
  const links = linkEdits('spray_record_paddocks', 'spray_record_id', id, 'paddock_id', s.paddockIds, existing.paddocks)
  adds.push(...links.adds)
  edits.push(...links.edits)
  for (const i of s.items) {
    const v: Row = {
      spray_record_id: id, product_id: i.productId, product_name: i.productId ? null : blank(i.productName ?? ''), batch_id: i.batchId,
      batch_number: blank(i.batchNumber ?? ''), expiry_date: i.expiryDate || null, application_rate: blank(i.rate),
      quantity_used: i.quantityUsed, grazing_whp_days: i.grazingWhpDays, harvest_whp_days: i.harvestWhpDays,
    }
    if (i.id) edits.push({ table: 'spray_record_items', id: i.id, changes: v, reason })
    else adds.push({ table: 'spray_record_items', values: v })
  }
  const kept = new Set(s.items.map((i) => i.id).filter(Boolean))
  for (const old of existing.items) if (old.spray_record_id === id && !old.deleted_at && !kept.has(String(old.id))) edits.push({ table: 'spray_record_items', id: String(old.id), changes: { deleted_at: new Date().toISOString() }, reason })
  return { id, adds, edits }
}

export type PastureItemInput = {
  id?: string
  kind: 'fertiliser' | 'species'
  productId: string | null
  productName: string | null
  batchId: string | null
  speciesName: string | null
  rate: string
  quantityUsed: number | null
}

export type PastureInput = {
  id?: string
  date: string
  type: 'fertiliser' | 'pasture_improvement'
  propertyId: string | null
  wholeProperty: boolean
  paddockIds: string[]
  areaHa: number | null
  overallRate: string
  contractorContactId: string | null
  jobId: string | null
  contractorEntered: boolean
  notes: string
  items: PastureItemInput[]
}

export function pasturePlan(p: PastureInput, existing: { paddocks: Row[]; items: Row[] } = { paddocks: [], items: [] }, reason?: string): { id: string; adds: NewRecord[]; edits: RecordEdit[] } {
  const id = p.id ?? crypto.randomUUID()
  const values: Row = {
    record_date: p.date, record_type: p.type, property_id: p.propertyId, whole_property: p.wholeProperty, area_ha: p.areaHa,
    overall_rate: blank(p.overallRate), contractor_contact_id: p.contractorContactId, job_id: p.jobId, contractor_entered: p.contractorEntered, notes: blank(p.notes),
  }
  const adds: NewRecord[] = []
  const edits: RecordEdit[] = []
  if (p.id) edits.push({ table: 'pasture_records', id, changes: values, reason })
  else adds.push({ table: 'pasture_records', values: { id, ...values } })
  const links = linkEdits('pasture_record_paddocks', 'pasture_record_id', id, 'paddock_id', p.wholeProperty ? [] : p.paddockIds, existing.paddocks)
  adds.push(...links.adds)
  edits.push(...links.edits)
  for (const i of p.items) {
    const v: Row = {
      pasture_record_id: id, item_kind: i.kind, product_id: i.kind === 'fertiliser' ? i.productId : null,
      product_name: i.kind === 'fertiliser' && !i.productId ? blank(i.productName ?? '') : null, batch_id: i.kind === 'fertiliser' ? i.batchId : null,
      species_name: i.kind === 'species' ? blank(i.speciesName ?? '') : null, rate: blank(i.rate), quantity_used: i.quantityUsed,
    }
    if (i.id) edits.push({ table: 'pasture_record_items', id: i.id, changes: v, reason })
    else adds.push({ table: 'pasture_record_items', values: v })
  }
  const kept = new Set(p.items.map((i) => i.id).filter(Boolean))
  for (const old of existing.items) if (old.pasture_record_id === id && !old.deleted_at && !kept.has(String(old.id))) edits.push({ table: 'pasture_record_items', id: String(old.id), changes: { deleted_at: new Date().toISOString() }, reason })
  return { id, adds, edits }
}

// Everything that happened on a paddock, newest first.
export type PaddockEvent = { date: string; kind: 'spray' | 'fertiliser' | 'pasture' | 'grazing' | 'issue'; text: string; path: string }

export function paddockHistory(paddockId: string, propertyId: string, d: {
  sprays: Row[]; sprayPaddocks: Row[]; sprayItems: Row[]
  pastures: Row[]; pasturePaddocks: Row[]; pastureItems: Row[]
  issues: Row[]
  productName: (id: string) => string
  grazing: { date: string; text: string; path: string }[]
}): PaddockEvent[] {
  const out: PaddockEvent[] = []
  for (const s of d.sprays) {
    if (!d.sprayPaddocks.some((l) => l.spray_record_id === s.id && l.paddock_id === paddockId)) continue
    const products = d.sprayItems.filter((i) => i.spray_record_id === s.id).map((i) => (i.product_id ? d.productName(String(i.product_id)) : String(i.product_name ?? ''))).filter(Boolean)
    out.push({ date: String(s.spray_date), kind: 'spray', text: `Sprayed${s.target ? ` for ${s.target}` : ''}: ${products.join(', ') || 'no products'}${s.grazing_withhold_until ? ` · don't graze until ${new Date(`${s.grazing_withhold_until}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}`, path: `/records/spray/${s.id}` })
  }
  for (const p of d.pastures) {
    const here = p.whole_property ? p.property_id === propertyId : d.pasturePaddocks.some((l) => l.pasture_record_id === p.id && l.paddock_id === paddockId)
    if (!here) continue
    const items = d.pastureItems.filter((i) => i.pasture_record_id === p.id)
    const what = items.map((i) => `${i.item_kind === 'species' ? String(i.species_name ?? '') : i.product_id ? d.productName(String(i.product_id)) : String(i.product_name ?? '')}${i.rate ? ` ${i.rate}` : ''}`).filter((x) => x.trim())
    out.push({ date: String(p.record_date), kind: p.record_type === 'fertiliser' ? 'fertiliser' : 'pasture', text: `${p.record_type === 'fertiliser' ? 'Fertiliser' : 'Pasture improvement'}: ${what.join(', ') || 'see record'}`, path: `/records/pasture/${p.id}` })
  }
  for (const i of d.issues) {
    if (i.paddock_id !== paddockId) continue
    out.push({ date: String(i.reported_at).slice(0, 10), kind: 'issue', text: `Issue: ${(i.categories as string[]).join(', ')}${i.status === 'done' ? ' (done)' : ''}`, path: `/issues/${i.id}` })
  }
  for (const g of d.grazing) out.push({ ...g, kind: 'grazing' })
  return out.sort((a, b) => b.date.localeCompare(a.date))
}
