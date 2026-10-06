// Bringing in a client's existing records:
//  * Farm Records v1: the CSV of any Google Sheet tab (or the app's own
//    download) for Mob Treatments, Stock Movements, Spray Records,
//    Pasture & Fertiliser and Vehicle Maintenance.
//  * Fence Map: its data.js (fences, pipes, points, energiser units and
//    paddock boundaries).
// Each import makes one import_batches row listing what it created, so it
// can be undone. Historical movements are kept as records only: they don't
// change today's head counts (those come from starting counts).
import type { Row } from './db'
import type { NewRecord } from './sync'

// ---- CSV ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

// Dates as the Sheet or the app wrote them: 2026-10-02, 2/10/2026, 02/10/26.
export function parseDate(v: string): string | null {
  const s = v.trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}
const num = (v: string | undefined) => { if (!v) return null; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return v.trim() === '' || Number.isNaN(n) ? null : n }
const t = (v: string | undefined) => (v && v.trim() ? v.trim() : null)

export type V1Area = 'mob' | 'movement' | 'spray' | 'pasture' | 'vehicle'

// Which v1 area a CSV is, from its header row.
export function detectV1Area(header: string[]): V1Area | null {
  const h = header.map((x) => x.trim().toLowerCase())
  if (h.includes('product / chemical') || h.includes('head treated')) return 'mob'
  if (h.includes('movement') && h.includes('no. of head')) return 'movement'
  if (h.includes('target weed / pest') || h.includes('paddock / area sprayed')) return 'spray'
  if (h.includes('paddocks (fert)') || h.includes('species')) return 'pasture'
  if (h.includes('vehicle / machine')) return 'vehicle'
  return null
}

export const V1_LABEL: Record<V1Area, string> = {
  mob: 'Mob Treatments', movement: 'Stock Movements', spray: 'Spray Records', pasture: 'Pasture & Fertiliser', vehicle: 'Vehicle Maintenance',
}

export type Existing = { properties: Row[]; paddocks: Row[]; mobs: Row[]; products: Row[]; contacts: Row[]; vehicles: Row[]; batches: Row[] }
export type Created = { table: string; id: string; cleared?: string }
export type ImportResult = { adds: NewRecord[]; edits: { table: string; id: string; changes: Row }[]; imported: number; skipped: { row: number; why: string }[]; created: Created[]; notes: string[] }

const lower = (s: unknown) => String(s ?? '').trim().toLowerCase()

// Finds or creates the things records point at, remembering what it made.
class Resolver {
  adds: NewRecord[] = []
  created: Created[] = []
  private e: Existing
  constructor(e: Existing) { this.e = e }
  add(table: string, values: Row): string {
    const id = String(values.id ?? crypto.randomUUID())
    this.adds.push({ table, values: { ...values, id } })
    this.created.push({ table, id })
    return id
  }
  // "Kooringa (NA123456)" or "NA123456" or "Kooringa"
  property(text: string | null): string | null {
    if (!text) return this.e.properties[0] ? String(this.e.properties[0].id) : null
    const pic = /\b([A-Z0-9]{8})\b/.exec(text.toUpperCase())?.[1]
    const name = lower(text.replace(/\(.*\)/, ''))
    const p = this.e.properties.find((x) => (pic && String(x.pic ?? '').toUpperCase() === pic) || lower(x.name) === name)
    return p ? String(p.id) : this.e.properties[0] ? String(this.e.properties[0].id) : null
  }
  mob(name: string | null): string | null {
    const m = name ? this.e.mobs.find((x) => lower(x.name) === lower(name)) : undefined
    return m ? String(m.id) : null
  }
  paddocks(text: string | null, propertyId: string | null): { ids: string[]; unmatched: string[] } {
    const names = (text ?? '').split(/[,;]/).map((x) => x.trim()).filter(Boolean)
    const ids: string[] = []
    const unmatched: string[] = []
    for (const n of names) {
      const d = this.e.paddocks.find((x) => lower(x.name) === lower(n) && (!propertyId || x.property_id === propertyId))
      if (d) ids.push(String(d.id))
      else unmatched.push(n)
    }
    return { ids, unmatched }
  }
  private productCache = new Map<string, string>()
  product(name: string | null, kind: string, whp?: number | null, esi?: number | null): string | null {
    if (!name) return null
    const clean = name.replace(/\s*\(.*\)\s*$/, '').trim()
    const key = `${kind}|${lower(clean)}`
    if (this.productCache.has(key)) return this.productCache.get(key)!
    const p = this.e.products.find((x) => lower(x.name) === lower(clean))
    const id = p ? String(p.id) : this.add('products', { name: clean, product_kind: kind, stock_unit: kind === 'fertiliser' ? 'kg' : 'mL', track_stock: false, label_whp_days: whp ?? null, label_esi_days: esi ?? null })
    this.productCache.set(key, id)
    return id
  }
  private batchCache = new Map<string, string>()
  batch(productId: string | null, number: string | null, expiry: string | null): string | null {
    if (!productId || !number) return null
    const key = `${productId}|${lower(number)}`
    if (this.batchCache.has(key)) return this.batchCache.get(key)!
    const b = this.e.batches.find((x) => x.product_id === productId && lower(x.batch_number) === lower(number))
    const id = b ? String(b.id) : this.add('product_batches', { product_id: productId, batch_number: number, expiry_date: expiry })
    this.batchCache.set(key, id)
    return id
  }
  private contactCache = new Map<string, string>()
  contact(name: string | null, pic: string | null, kind: string): string | null {
    if (!name && !pic) return null
    const key = `${lower(name)}|${lower(pic)}`
    if (this.contactCache.has(key)) return this.contactCache.get(key)!
    const c = this.e.contacts.find((x) => (pic && lower(x.pic) === lower(pic)) || (name && lower(x.name) === lower(name)))
    const id = c ? String(c.id) : this.add('contacts', { name: name || pic, pic: pic ? pic.toUpperCase() : null, kinds: [kind] })
    this.contactCache.set(key, id)
    return id
  }
  private vehicleCache = new Map<string, string>()
  vehicle(name: string): string {
    const key = lower(name)
    if (this.vehicleCache.has(key)) return this.vehicleCache.get(key)!
    const v = this.e.vehicles.find((x) => lower(x.name) === key)
    const id = v ? String(v.id) : this.add('vehicles', { name, reading_unit: 'km' })
    this.vehicleCache.set(key, id)
    return id
  }
}

const NLIS: Record<string, string> = { lodged: 'lodged', 'to do': 'to_do', todo: 'to_do', 'not required': 'not_required', 'n/a': 'not_required' }
const ARRIVE: Record<string, string> = { purchase: 'purchase', bought: 'purchase', agistment: 'agistment_in', 'agistment in': 'agistment_in', 'return from agistment': 'return_from_agistment' }
const LEAVE: Record<string, string> = { saleyard: 'saleyard', sale: 'sale', 'private sale': 'sale', 'direct sale': 'sale', abattoir: 'slaughter', slaughter: 'slaughter', agistment: 'agistment_out', 'agistment out': 'agistment_out' }

export function importV1(csv: string[][], e: Existing, opts: { owner: boolean }): ImportResult & { area: V1Area | null } {
  const [header, ...body] = csv
  const area = header ? detectV1Area(header) : null
  const r = new Resolver(e)
  const skipped: ImportResult['skipped'] = []
  const notes: string[] = []
  let imported = 0
  if (!area) return { area, adds: [], edits: [], imported: 0, skipped: [], created: [], notes: ["This doesn't look like a Farm Records v1 sheet."] }
  const col = (row: string[], label: string) => { const i = header.findIndex((h) => lower(h) === lower(label)); return i >= 0 ? row[i] ?? '' : '' }

  body.forEach((row, n) => {
    const line = n + 2
    const date = parseDate(col(row, 'Date'))
    if (!date) { skipped.push({ row: line, why: 'No date' }); return }

    if (area === 'mob') {
      const product = t(col(row, 'Product / chemical'))
      if (!product) { skipped.push({ row: line, why: 'No product' }); return }
      const whp = num(col(row, 'WHP (days)'))
      const esi = num(col(row, 'ESI (days)'))
      const productId = r.product(product, 'animal_treatment', whp, esi)
      const mobName = t(col(row, 'Mob / paddock'))
      const tid = r.add('treatments', {
        treatment_date: date, property_id: r.property(t(col(row, 'Property / PIC'))), mob_id: r.mob(mobName),
        head_treated: num(col(row, 'Head treated')), livestock_description: [mobName, t(col(row, 'Animal type / class'))].filter(Boolean).join(' · ') || null,
        treated_by_name: t(col(row, 'Operator')), notes: [t(col(row, 'Notes')), 'Imported from Farm Records v1'].filter(Boolean).join(' · '),
      })
      r.add('treatment_items', {
        treatment_id: tid, product_id: productId, batch_id: r.batch(productId, t(col(row, 'Batch number')), null),
        dose_rate: t(col(row, 'Dose rate')), route: t(col(row, 'Route')), reason: t(col(row, 'Reason')),
        whp_days: whp, esi_days: esi, whp_until: parseDate(col(row, 'Meat withhold until')), esi_until: parseDate(col(row, 'Export (ESI) until')),
      })
    } else if (area === 'movement') {
      const dir = lower(col(row, 'Movement'))
      const on = dir.includes('on') && !dir.includes('off')
      const reason = lower(col(row, 'Reason'))
      const fromPic = t(col(row, 'PIC (from)'))
      const toPic = t(col(row, 'PIC (to)'))
      const own = r.property(on ? toPic ?? t(col(row, 'Property (to)')) : fromPic ?? t(col(row, 'Property (from)')))
      r.add('stock_events', {
        event_date: date, event_type: on ? 'arrival' : 'exit',
        reason: (on ? ARRIVE : LEAVE)[reason] ?? 'other',
        to_property_id: on ? own : null, from_property_id: on ? null : own,
        counterparty_contact_id: on ? r.contact(t(col(row, 'Property (from)')), fromPic, 'vendor') : r.contact(t(col(row, 'Property (to)')), toPic, 'buyer'),
        nvd_number: t(col(row, 'NVD / waybill no.')), carrier_contact_id: r.contact(t(col(row, 'Carrier / transport')), null, 'carrier'),
        truck_rego: t(col(row, 'Truck rego')), nlis_transfer_status: NLIS[lower(col(row, 'NLIS transfer'))] ?? null,
        // A record of the movement only: today's head counts come from starting counts.
        counted_head: num(col(row, 'No. of head')),
        notes: [t(col(row, 'Mob / description')), t(col(row, 'Type / class')), t(col(row, 'Notes')), 'Imported from Farm Records v1 (record only)'].filter(Boolean).join(' · '),
      })
    } else if (area === 'spray') {
      const propertyId = r.property(t(col(row, 'Property / address')))
      const pdks = r.paddocks(t(col(row, 'Paddock / area sprayed')), propertyId)
      const whp = num(col(row, 'Grazing/harvest WHP (days)'))
      const sid = r.add('spray_records', {
        spray_date: date, start_time: t(col(row, 'Start time')), property_id: propertyId, situation: t(col(row, 'Situation / crop')), target: t(col(row, 'Target weed / pest')),
        water_rate: t(col(row, 'Water rate')), area_ha: num(col(row, 'Area covered')), wind_speed_direction: t(col(row, 'Wind speed & direction')),
        temperature_c: num(col(row, 'Temperature (°C)')), humidity_delta_t: t(col(row, 'Humidity / delta T')),
        applicator_name: t(col(row, 'Applicator name')), licence_number: t(col(row, 'Chemical licence no.')),
        grazing_withhold_until: parseDate(col(row, 'Grazable/harvest from')) ?? null,
        notes: [t(col(row, 'Notes / changes')), pdks.unmatched.length ? `Paddocks: ${pdks.unmatched.join(', ')}` : null, 'Imported from Farm Records v1'].filter(Boolean).join(' · '),
      })
      for (const pid of pdks.ids) r.add('spray_record_paddocks', { spray_record_id: sid, paddock_id: pid })
      r.add('spray_record_items', {
        spray_record_id: sid, product_name: t(col(row, 'Product (APVMA reg.)')) ?? 'Not recorded', batch_number: t(col(row, 'Batch number')),
        expiry_date: parseDate(col(row, 'Expiry date')), application_rate: t(col(row, 'Application rate')), grazing_whp_days: whp,
      })
    } else if (area === 'pasture') {
      const fert = lower(col(row, 'Type')).startsWith('fert')
      const propertyId = r.property(t(col(row, 'Property')))
      const pdks = r.paddocks(t(col(row, fert ? 'Paddocks (fert)' : 'Paddocks (pasture)')), propertyId)
      const pid = r.add('pasture_records', {
        record_date: date, record_type: fert ? 'fertiliser' : 'pasture_improvement', property_id: propertyId,
        area_ha: num(col(row, fert ? 'Area (fert)' : 'Area (pasture)')), overall_rate: t(col(row, fert ? 'Rate (fert)' : 'Sowing rate')),
        contractor_contact_id: r.contact(t(col(row, fert ? 'Contractor (fert)' : 'Contractor (pasture)')), null, 'contractor'),
        notes: [t(col(row, fert ? 'Notes (fert)' : 'Notes (pasture)')), pdks.unmatched.length ? `Paddocks: ${pdks.unmatched.join(', ')}` : null, 'Imported from Farm Records v1'].filter(Boolean).join(' · '),
      })
      for (const d of pdks.ids) r.add('pasture_record_paddocks', { pasture_record_id: pid, paddock_id: d })
      // "Single super (125 kg/ha), Urea (50 kg/ha)"
      const products = (t(col(row, fert ? 'Fertiliser products (fert)' : 'Fertiliser products (pasture)')) ?? '').split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean)
      for (const p of products) r.add('pasture_record_items', { pasture_record_id: pid, item_kind: 'fertiliser', product_name: p.replace(/\s*\(.*\)$/, ''), rate: /\(([^)]*)\)/.exec(p)?.[1] ?? t(col(row, 'Fertiliser rate')) })
      if (!fert) for (const sp of (t(col(row, 'Species')) ?? '').split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean)) {
        r.add('pasture_record_items', { pasture_record_id: pid, item_kind: 'species', species_name: sp.replace(/\s*\(.*\)$/, ''), rate: /\(([^)]*)\)/.exec(sp)?.[1] ?? null })
      }
      const price = num(col(row, fert ? 'Price (fert)' : 'Cost'))
      if (opts.owner && price !== null) r.add('record_prices', { record_table: 'pasture_records', record_id: pid, total_amount: price })
    } else if (area === 'vehicle') {
      const name = t(col(row, 'Vehicle / machine'))
      if (!name) { skipped.push({ row: line, why: 'No vehicle' }); return }
      const next = col(row, 'Next service due')
      const sid = r.add('vehicle_services', {
        service_date: date, vehicle_id: r.vehicle(name), reading: num(col(row, 'Hours / kms')), service_type: t(col(row, 'Service type')),
        work_done: (t(col(row, 'Work done')) ?? '').split(/,|;/).map((x) => x.trim()).filter(Boolean), parts_used: t(col(row, 'Parts / oil used')),
        done_by: t(col(row, 'Done by')), next_due_date: parseDate(next), next_due_reading: parseDate(next) ? null : num(next),
        notes: [t(col(row, 'Notes')), 'Imported from Farm Records v1'].filter(Boolean).join(' · '),
      })
      const cost = num(col(row, 'Cost ($)'))
      if (opts.owner && cost !== null) r.add('record_prices', { record_table: 'vehicle_services', record_id: sid, total_amount: cost })
    }
    imported++
  })
  if (area === 'movement') notes.push("Movements come in as records for the LPA history. They don't change today's head counts; add your mobs with starting counts.")
  if (!opts.owner && (area === 'vehicle' || area === 'pasture')) notes.push('Prices and costs were left out (only an owner can import them).')
  return { area, adds: r.adds, edits: [], imported, skipped, created: r.created, notes }
}

// ---- Fence Map data.js ------------------------------------------------------------------

type FmFeature = { id: string; type: string; kind?: string; name?: string; note?: string; unit?: string; coords?: [number, number][]; latlng?: [number, number] }
type FmProperty = { id: string; name: string; center?: [number, number]; zoom?: number; units?: { id: string; name: string; note?: string; latlng: [number, number] }[]; features?: FmFeature[] }

// data.js is a JavaScript object, not JSON: read it without running it.
export function parseFenceMapData(text: string): FmProperty[] {
  let s = text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error("This doesn't look like a Fence Map data.js file.")
  s = s.slice(start, end + 1)
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, '$1')
  const data = JSON.parse(s) as { properties?: FmProperty[] }
  return data.properties ?? []
}

const ll = ([lat, lng]: [number, number]): [number, number] => [lng, lat]
const KIND: Record<string, string> = { trough: 'trough', tank: 'tank', gate: 'gate', yards: 'yard', dam: 'dam', other: 'other' }

export function importFenceMap(fm: FmProperty, propertyId: string, e: Existing, areaHa: (coords: [number, number][][]) => number): ImportResult {
  const r = new Resolver(e)
  const prop = e.properties.find((p) => p.id === propertyId)
  const edits: { table: string; id: string; changes: Row }[] = []
  const unitIds = new Map<string, string>()
  let imported = 0
  for (const u of fm.units ?? []) {
    unitIds.set(u.id, r.add('map_features', { property_id: propertyId, feature_type: 'electric_unit', name: u.name, notes: u.note || null, geometry: { type: 'Point', coordinates: ll(u.latlng) } }))
    imported++
  }
  for (const f of fm.features ?? []) {
    if (f.type === 'paddock' && f.coords?.length) {
      const ring = f.coords.map(ll)
      if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) ring.push(ring[0])
      const boundary = { type: 'Polygon', coordinates: [ring] }
      const existing = e.paddocks.find((d) => d.property_id === propertyId && lower(d.name) === lower(f.name))
      if (existing && !existing.boundary) {
        edits.push({ table: 'paddocks', id: String(existing.id), changes: { boundary, ...(existing.area_overridden ? {} : { area_ha: areaHa([ring]) }) } })
        r.created.push({ table: 'paddocks', id: String(existing.id), cleared: 'boundary' })
      } else if (!existing) {
        r.add('paddocks', { property_id: propertyId, name: f.name || 'Paddock', boundary, area_ha: areaHa([ring]), area_overridden: false, notes: f.note || null })
      }
    } else if ((f.type === 'fence' || f.type === 'pipe') && f.coords?.length) {
      const unit = f.unit ? unitIds.get(f.unit) ?? null : null
      r.add('map_features', {
        property_id: propertyId, feature_type: f.type === 'pipe' ? 'pipe' : unit ? 'electric_fence' : 'fence', name: f.name || null, notes: f.note || null,
        electric_unit_id: f.type === 'fence' ? unit : null, geometry: { type: 'LineString', coordinates: f.coords.map(ll) },
      })
    } else if (f.type === 'point' && f.latlng) {
      r.add('map_features', { property_id: propertyId, feature_type: KIND[f.kind ?? 'other'] ?? 'other', name: f.name || null, notes: f.note || null, geometry: { type: 'Point', coordinates: ll(f.latlng) } })
    } else continue
    imported++
  }
  if (prop && !prop.centre_lat && fm.center) edits.push({ table: 'properties', id: propertyId, changes: { centre_lat: fm.center[0], centre_lng: fm.center[1], default_zoom: fm.zoom ?? 15 } })
  return { adds: r.adds, edits, imported, skipped: [], created: r.created, notes: [] }
}
