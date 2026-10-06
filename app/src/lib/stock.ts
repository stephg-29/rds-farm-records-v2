// Stock, worked out on the phone from the records (so it works offline).
// Mirrors the database views: head counts come only from count lines, and
// a mob's location only from location changes, never typed in. A record
// whose event has been deleted no longer counts.
import type { Row } from './db'
import type { NewRecord, RecordEdit } from './sync'

export type StockData = { mobs: Row[]; events: Row[]; lines: Row[]; locations: Row[] }

export type Location = { propertyId: string; paddockId: string | null; since: string; eventId: string }

const str = (v: unknown) => (v === null || v === undefined ? null : String(v))

export function todayLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function liveEvents(s: StockData): Map<string, Row> {
  return new Map(s.events.filter((e) => !e.deleted_at).map((e) => [String(e.id), e]))
}

// Count lines that still count (neither the line nor its event deleted).
export function liveLines(s: StockData): (Row & { event: Row })[] {
  const events = liveEvents(s)
  return s.lines.flatMap((l) => {
    const event = events.get(String(l.stock_event_id))
    return !l.deleted_at && event ? [{ ...l, event }] : []
  })
}

export function mobHeads(s: StockData): Map<string, number> {
  const heads = new Map<string, number>()
  for (const l of liveLines(s)) heads.set(String(l.mob_id), (heads.get(String(l.mob_id)) ?? 0) + Number(l.head_change))
  return heads
}

// Head per class for one mob (class id, or null for lines with no class).
export function classHeads(s: StockData, mobId: string): Map<string | null, number> {
  const heads = new Map<string | null, number>()
  for (const l of liveLines(s)) {
    if (l.mob_id !== mobId) continue
    const k = str(l.livestock_class_id)
    heads.set(k, (heads.get(k) ?? 0) + Number(l.head_change))
  }
  return heads
}

// Latest first: event date, then when it was recorded or created.
function newestFirst(a: { event: Row; change: Row }, b: { event: Row; change: Row }) {
  const k = (x: { event: Row; change: Row }) => [
    String(x.event.event_date),
    String(x.event.recorded_at ?? ''),
    String(x.event.created_at ?? ''),
    String(x.change.recorded_at ?? x.change.created_at ?? ''),
  ]
  const ka = k(a)
  const kb = k(b)
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? 1 : -1
  return 0
}

function locationHistory(s: StockData): Map<string, { event: Row; change: Row }[]> {
  const events = liveEvents(s)
  const byMob = new Map<string, { event: Row; change: Row }[]>()
  for (const c of s.locations) {
    const event = events.get(String(c.stock_event_id))
    if (c.deleted_at || !event) continue
    const list = byMob.get(String(c.mob_id)) ?? []
    list.push({ event, change: c })
    byMob.set(String(c.mob_id), list)
  }
  for (const list of byMob.values()) list.sort(newestFirst)
  return byMob
}

export function currentLocations(s: StockData): Map<string, Location> {
  const out = new Map<string, Location>()
  for (const [mobId, list] of locationHistory(s)) {
    const { event, change } = list[0]
    out.set(mobId, { propertyId: String(change.property_id), paddockId: str(change.paddock_id), since: String(event.event_date), eventId: String(event.id) })
  }
  return out
}

// Moves and counts left as "recount later" that still need doing.
export function openRecounts(s: StockData, mobId: string): Row[] {
  const involved = eventsForMob(s, mobId)
  return [...involved.values()].filter((e) => e.discrepancy_action === 'recount_later')
}

function eventsForMob(s: StockData, mobId: string): Map<string, Row> {
  const events = liveEvents(s)
  const ids = new Set<string>()
  for (const l of s.lines) if (l.mob_id === mobId && !l.deleted_at) ids.add(String(l.stock_event_id))
  for (const c of s.locations) if (c.mob_id === mobId && !c.deleted_at) ids.add(String(c.stock_event_id))
  return new Map([...ids].flatMap((id) => (events.has(id) ? [[id, events.get(id)!] as const] : [])))
}

// ---- History ------------------------------------------------------------------

export type HistoryItem = {
  event: Row
  date: string
  text: string
  edited: boolean
}

export const ADJUST_REASONS = [
  { value: 'dead_found', label: 'Dead found' },
  { value: 'missing', label: 'Missing' },
  { value: 'boxed_with_other_mob', label: 'Boxed with another mob' },
  { value: 'strays_extra', label: 'Strays or extra' },
  { value: 'earlier_miscount', label: 'Miscounted earlier' },
  { value: 'unknown', label: "Don't know" },
] as const
export type AdjustReason = (typeof ADJUST_REASONS)[number]['value']

const ARRIVAL_REASONS: Record<string, string> = { purchase: 'Bought', agistment_in: 'Agisted in', return_from_agistment: 'Back from agistment', other: 'Arrived' }
const EXIT_TEXT: Record<string, string> = {
  sale: 'Sold', saleyard: 'Sold at saleyard', slaughter: 'To abattoir', agistment_out: 'Out on agistment',
  return_from_agistment: 'Returned to owner', other: 'Left',
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function mobHistory(s: StockData, mobId: string, names: { paddock: (id: string | null, propertyId: string) => string; mob: (id: string) => string }): HistoryItem[] {
  const lines = liveLines(s)
  const locs = locationHistory(s).get(mobId) ?? []
  const items: HistoryItem[] = []

  for (const event of eventsForMob(s, mobId).values()) {
    const myLines = lines.filter((l) => l.stock_event_id === event.id && l.mob_id === mobId)
    const change = myLines.reduce((n, l) => n + Number(l.head_change), 0)
    const at = locs.findIndex((x) => x.event.id === event.id)
    const here = at >= 0 ? locs[at].change : null
    const before = at >= 0 ? locs[at + 1]?.change : null
    const where = here ? names.paddock(str(here.paddock_id), String(here.property_id)) : null
    const counted = event.counted_head !== null && event.counted_head !== undefined
      ? ` · counted ${event.counted_head} of ${event.expected_head}` : ''
    const recount = event.discrepancy_action === 'recount_later' ? ' · recount to do' : ''
    const reason = ADJUST_REASONS.find((r) => r.value === event.reason)?.label.toLowerCase()
    let text: string

    switch (event.event_type) {
      case 'paddock_move':
        text = `Moved ${before ? `${names.paddock(str(before.paddock_id), String(before.property_id))} → ` : 'to '}${where ?? '?'}${counted}${recount}`
        if (event.nvd_number) text += ` · NVD ${event.nvd_number}`
        break
      case 'arrival':
        text = `${ARRIVAL_REASONS[String(event.reason)] ?? 'Arrived'}: ${plural(change, 'head', 'head')}${where ? ` into ${where}` : ''}`
        if (event.nvd_number) text += ` · NVD ${event.nvd_number}`
        break
      case 'death': {
        const cause = reason ?? (event.reason ? String(event.reason).toLowerCase() : null)
        text = `${plural(-change, 'dead', 'dead')}${cause ? ` (${cause})` : ''}`
        break
      }
      case 'exit': {
        const how = EXIT_TEXT[String(event.reason)] ?? 'Left'
        text = `${how}: ${plural(-change, 'head', 'head')}`
        if (event.nvd_number) text += ` · NVD ${event.nvd_number}`
        if (event.needs_review) text += ' · CHECK: inside a withhold'
        break
      }
      case 'split':
      case 'merge': {
        const others = [...new Set(lines.filter((l) => l.stock_event_id === event.id && l.mob_id !== mobId).map((l) => names.mob(String(l.mob_id))))]
        const list = others.join(', ') || 'another mob'
        if (event.event_type === 'split') text = change < 0 ? `Split ${plural(-change, 'head', 'head')} off to ${list}` : `Split from ${list}: ${plural(change, 'head', 'head')}`
        else text = change < 0 ? `Merged into ${list}` : `${list} merged in: ${plural(change, 'head', 'head')}`
        if (where && change > 0 && event.event_type === 'split') text += ` · into ${where}`
        break
      }
      case 'transfer_between_mobs': {
        const other = lines.find((l) => l.stock_event_id === event.id && l.mob_id !== mobId)
        const otherName = other ? names.mob(String(other.mob_id)) : 'another mob'
        text = change < 0 ? `${plural(-change, 'head', 'head')} were with ${otherName}` : `${plural(change, 'head', 'head')} from ${otherName}`
        break
      }
      case 'count_adjustment':
        if (event.reason === 'opening_count') text = `Starting count: ${plural(change, 'head', 'head')}${where ? ` in ${where}` : ''}`
        else if (event.reason === 'count') text = `Counted ${event.counted_head} (book ${event.expected_head})${recount}`
        else text = `Count ${change >= 0 ? '+' : '−'}${Math.abs(change)}${reason ? ` (${reason})` : ''}`
        break
      default:
        text = `${String(event.event_type).replace(/_/g, ' ')}${change ? ` ${change > 0 ? '+' : '−'}${Math.abs(change)}` : ''}`
    }
    if (event.notes) text += ` · ${event.notes}`
    items.push({ event, date: String(event.event_date), text, edited: !!event.updated_at })
  }
  return items.sort((a, b) => newestFirst({ event: a.event, change: {} }, { event: b.event, change: {} }))
}

// ---- Building the records for each action -------------------------------------

const id = () => crypto.randomUUID()

export type NewMobInput = {
  name: string
  species: string
  classId: string | null
  head: number
  propertyId: string
  paddockId: string | null
  date: string
  // Already on the farm when the app started (a starting count), or arriving now.
  how: 'on_hand' | 'purchase' | 'agistment_in' | 'other'
  nvd?: string | null
  notes?: string | null
  // Vendor, carrier, NLIS, weight and price, for arrivals.
  movement?: Movement
}

export function newMobPlan(i: NewMobInput): { mobId: string; adds: NewRecord[] } {
  const mobId = id()
  const eventId = id()
  const arriving = i.how !== 'on_hand'
  return {
    mobId,
    adds: [
      { table: 'mobs', values: { id: mobId, name: i.name, species: i.species } },
      { table: 'stock_events', values: {
        id: eventId, event_date: i.date,
        event_type: arriving ? 'arrival' : 'count_adjustment',
        reason: arriving ? i.how : 'opening_count',
        to_property_id: i.propertyId,
        nvd_number: arriving ? i.nvd || null : null,
        counted_head: i.head,
        notes: i.notes || null,
        ...(arriving && i.movement ? { ...movementValues(i.movement), nvd_number: i.movement.nvd || i.nvd || null, average_weight_kg: avgWeight(i.movement.totalWeightKg, i.head) } : {}),
      } },
      ...(arriving && i.movement ? priceRecord(eventId, i.movement) : []),
      { table: 'stock_event_lines', values: { stock_event_id: eventId, mob_id: mobId, livestock_class_id: i.classId, head_change: i.head } },
      { table: 'mob_location_changes', values: { stock_event_id: eventId, mob_id: mobId, property_id: i.propertyId, paddock_id: i.paddockId } },
    ],
  }
}

// What to do when the count doesn't match the book.
export type CountOutcome =
  | { kind: 'match' }
  | { kind: 'recount_later' }
  | { kind: 'accept'; reason: AdjustReason; classId: string | null; otherMobId?: string | null; otherClassId?: string | null }

type AdjustInput = { mobId: string; date: string; diff: number; relatedId: string; outcome: Extract<CountOutcome, { kind: 'accept' }> }

// The adjustment for an accepted count: a death, a transfer with the mob they
// were boxed with, or a plain adjustment. Head is never silently overwritten.
function adjustmentPlan(a: AdjustInput): NewRecord[] {
  const eventId = id()
  const { reason, classId, otherMobId, otherClassId } = a.outcome
  const boxed = reason === 'boxed_with_other_mob' && !!otherMobId
  const event_type = boxed ? 'transfer_between_mobs' : reason === 'dead_found' && a.diff < 0 ? 'death' : 'count_adjustment'
  const adds: NewRecord[] = [
    { table: 'stock_events', values: { id: eventId, event_date: a.date, event_type, reason, related_event_id: a.relatedId } },
    { table: 'stock_event_lines', values: { stock_event_id: eventId, mob_id: a.mobId, livestock_class_id: classId, head_change: a.diff } },
  ]
  if (boxed) {
    adds.push({ table: 'stock_event_lines', values: { stock_event_id: eventId, mob_id: otherMobId, livestock_class_id: otherClassId ?? classId, head_change: -a.diff } })
  }
  return adds
}

function discrepancy(book: number, counted: number, outcome: CountOutcome): string | null {
  if (counted === book) return null
  return outcome.kind === 'recount_later' ? 'recount_later' : 'accepted'
}

// Earlier "recount later"s are closed by any new count.
function closeRecounts(open: Row[]): RecordEdit[] {
  return open.map((e) => ({ table: 'stock_events', id: String(e.id), changes: { discrepancy_action: 'recounted' } }))
}

export type MoveInput = {
  mobId: string
  date: string
  from: Location | null
  to: { propertyId: string; paddockId: string | null }
  book: number
  counted: number
  outcome: CountOutcome
  nvd?: string | null
  notes?: string | null
  openRecounts: Row[]
}

export function movePlan(m: MoveInput): { adds: NewRecord[]; edits: RecordEdit[] } {
  const eventId = id()
  const crossing = !!m.from && m.from.propertyId !== m.to.propertyId
  const adds: NewRecord[] = [
    { table: 'stock_events', values: {
      id: eventId, event_date: m.date, event_type: 'paddock_move',
      from_property_id: m.from?.propertyId ?? null, to_property_id: m.to.propertyId,
      nvd_number: crossing ? m.nvd || null : null,
      expected_head: m.book, counted_head: m.counted,
      discrepancy_action: discrepancy(m.book, m.counted, m.outcome),
      notes: m.notes || null,
    } },
    { table: 'mob_location_changes', values: { stock_event_id: eventId, mob_id: m.mobId, property_id: m.to.propertyId, paddock_id: m.to.paddockId } },
  ]
  if (m.counted !== m.book && m.outcome.kind === 'accept') {
    adds.push(...adjustmentPlan({ mobId: m.mobId, date: m.date, diff: m.counted - m.book, relatedId: eventId, outcome: m.outcome }))
  }
  return { adds, edits: closeRecounts(m.openRecounts) }
}

export type CountInput = { mobId: string; date: string; book: number; counted: number; outcome: CountOutcome; notes?: string | null; openRecounts: Row[] }

// A count in the paddock, without moving. Recorded even when it matches,
// so there's a dated record that the mob was counted.
export function countPlan(c: CountInput): { adds: NewRecord[]; edits: RecordEdit[] } {
  const eventId = id()
  const adds: NewRecord[] = [
    { table: 'stock_events', values: {
      id: eventId, event_date: c.date, event_type: 'count_adjustment', reason: 'count',
      expected_head: c.book, counted_head: c.counted,
      discrepancy_action: discrepancy(c.book, c.counted, c.outcome),
      notes: c.notes || null,
    } },
    // A zero line ties the count to the mob without changing any totals.
    { table: 'stock_event_lines', values: { stock_event_id: eventId, mob_id: c.mobId, livestock_class_id: null, head_change: 0 } },
  ]
  if (c.counted !== c.book && c.outcome.kind === 'accept') {
    adds.push(...adjustmentPlan({ mobId: c.mobId, date: c.date, diff: c.counted - c.book, relatedId: eventId, outcome: c.outcome }))
  }
  return { adds, edits: closeRecounts(c.openRecounts) }
}

export type GroupMoveInput = {
  date: string
  to: { propertyId: string; paddockId: string | null }
  nvd?: string | null
  notes?: string | null
  mobs: { mobId: string; from: Location | null; book: number; counted: number; outcome: CountOutcome; openRecounts: Row[] }[]
}

// Several mobs moved together (e.g. everything in a paddock). Each mob gets
// its own move record and count, so each keeps its own history; they're
// saved as one action.
export function groupMovePlan(g: GroupMoveInput): { adds: NewRecord[]; edits: RecordEdit[] } {
  const plans = g.mobs.map((m) => movePlan({ ...m, date: g.date, to: g.to, nvd: g.nvd, notes: g.notes }))
  return { adds: plans.flatMap((p) => p.adds), edits: plans.flatMap((p) => p.edits) }
}

// ---- Splits, merges, exits, deaths and arrivals ---------------------------------

export type ClassHead = { classId: string | null; head: number }
export type WithholdChoice = 'applied' | 'not_applied' | null

export type SplitPart = {
  // A new mob, or an existing one to put them into.
  newMob?: { name: string; species: string }
  mobId?: string
  lines: ClassHead[]
  // Where the new mob goes (null: stays with the source).
  to: { propertyId: string; paddockId: string | null } | null
  // Only when the source mob is under withhold: carry it to this mob or not.
  withholdChoice: WithholdChoice
}

export function splitPlan(s: { sourceMobId: string; date: string; parts: SplitPart[]; notes?: string | null }): { adds: NewRecord[]; mobIds: string[] } {
  const eventId = id()
  const adds: NewRecord[] = [{ table: 'stock_events', values: { id: eventId, event_date: s.date, event_type: 'split', notes: s.notes || null } }]
  const mobIds: string[] = []
  const locations: NewRecord[] = []
  for (const p of s.parts) {
    let mobId = p.mobId
    if (p.newMob) {
      mobId = id()
      adds.push({ table: 'mobs', values: { id: mobId, name: p.newMob.name, species: p.newMob.species } })
    }
    mobIds.push(mobId!)
    for (const l of p.lines.filter((x) => x.head > 0)) {
      adds.push({ table: 'stock_event_lines', values: { stock_event_id: eventId, mob_id: s.sourceMobId, livestock_class_id: l.classId, head_change: -l.head } })
      adds.push({ table: 'stock_event_lines', values: { stock_event_id: eventId, mob_id: mobId, livestock_class_id: l.classId, head_change: l.head, withhold_choice: p.withholdChoice } })
    }
    if (p.to) locations.push({ table: 'mob_location_changes', values: { stock_event_id: eventId, mob_id: mobId, property_id: p.to.propertyId, paddock_id: p.to.paddockId } })
  }
  return { adds: [...adds, ...locations], mobIds }
}

// Merge other mobs into one. One merge record per mob merged in, so each
// one's withhold choice is kept separately.
export function mergePlan(m: { intoMobId: string; date: string; sources: { mobId: string; lines: ClassHead[]; withholdChoice: WithholdChoice }[]; archiveEmptied: boolean; notes?: string | null }): { adds: NewRecord[]; edits: RecordEdit[] } {
  const adds: NewRecord[] = []
  const edits: RecordEdit[] = []
  for (const src of m.sources) {
    const eventId = id()
    adds.push({ table: 'stock_events', values: { id: eventId, event_date: m.date, event_type: 'merge', notes: m.notes || null } })
    for (const l of src.lines.filter((x) => x.head !== 0)) {
      adds.push({ table: 'stock_event_lines', values: { stock_event_id: eventId, mob_id: src.mobId, livestock_class_id: l.classId, head_change: -l.head } })
      adds.push({ table: 'stock_event_lines', values: { stock_event_id: eventId, mob_id: m.intoMobId, livestock_class_id: l.classId, head_change: l.head, withhold_choice: src.withholdChoice } })
    }
    if (m.archiveEmptied) edits.push({ table: 'mobs', id: src.mobId, changes: { archived_at: new Date().toISOString() } })
  }
  return { adds, edits }
}

export const EXIT_REASONS = [
  { value: 'sale', label: 'Sold (direct)' },
  { value: 'saleyard', label: 'Saleyard' },
  { value: 'slaughter', label: 'Abattoir' },
  { value: 'agistment_out', label: 'Out on agistment' },
  { value: 'return_from_agistment', label: 'Returned to owner (agisted stock)' },
  { value: 'other', label: 'Other' },
] as const

export const NLIS_STATUS = [
  { value: 'to_do', label: 'To do' },
  { value: 'lodged', label: 'Lodged' },
  { value: 'carrier_to_lodge', label: 'Agent or carrier to lodge' },
  { value: 'not_required', label: 'Not required' },
] as const

export type Movement = {
  counterpartyId: string | null
  nvd: string | null
  carrierId: string | null
  truckRego: string | null
  nlis: string | null
  totalWeightKg: number | null
  notes: string | null
  // Owners only; null when not entered.
  price: { perHead: number | null; perKg: number | null; total: number | null } | null
}

function movementValues(mv: Movement): Row {
  return {
    counterparty_contact_id: mv.counterpartyId, nvd_number: mv.nvd || null, carrier_contact_id: mv.carrierId,
    truck_rego: mv.truckRego || null, nlis_transfer_status: mv.nlis, total_weight_kg: mv.totalWeightKg, notes: mv.notes || null,
  }
}

function priceRecord(eventId: string, mv: Movement): NewRecord[] {
  const p = mv.price
  if (!p || (p.perHead === null && p.perKg === null && p.total === null)) return []
  return [{ table: 'record_prices', values: { record_table: 'stock_events', record_id: eventId, price_per_head: p.perHead, price_per_kg: p.perKg, total_amount: p.total } }]
}

const avgWeight = (total: number | null, head: number) => (total && head > 0 ? Math.round((total / head) * 10) / 10 : null)

export function exitPlan(x: { mobId: string; date: string; fromPropertyId: string | null; reason: string; market: 'domestic' | 'export' | 'unknown'; lines: ClassHead[]; movement: Movement; overrideReason: string | null }): NewRecord[] {
  const eventId = id()
  const head = x.lines.reduce((n, l) => n + l.head, 0)
  return [
    { table: 'stock_events', values: {
      id: eventId, event_date: x.date, event_type: 'exit', reason: x.reason, market: x.market, from_property_id: x.fromPropertyId,
      average_weight_kg: avgWeight(x.movement.totalWeightKg, head), withhold_override_reason: x.overrideReason || null, ...movementValues(x.movement),
    } },
    ...x.lines.filter((l) => l.head > 0).map((l) => ({ table: 'stock_event_lines', values: { stock_event_id: eventId, mob_id: x.mobId, livestock_class_id: l.classId, head_change: -l.head } })),
    ...priceRecord(eventId, x.movement),
  ]
}

export function deathsPlan(d: { mobId: string; date: string; lines: ClassHead[]; cause: string | null; notes: string | null }): NewRecord[] {
  const eventId = id()
  return [
    { table: 'stock_events', values: { id: eventId, event_date: d.date, event_type: 'death', reason: d.cause || null, notes: d.notes || null } },
    ...d.lines.filter((l) => l.head > 0).map((l) => ({ table: 'stock_event_lines', values: { stock_event_id: eventId, mob_id: d.mobId, livestock_class_id: l.classId, head_change: -l.head } })),
  ]
}

// Stock arriving into an existing mob (bought, agisted in, back from agistment).
export function arrivalPlan(a: { mobId: string; date: string; toPropertyId: string | null; reason: string; lines: ClassHead[]; movement: Movement }): NewRecord[] {
  const eventId = id()
  const head = a.lines.reduce((n, l) => n + l.head, 0)
  return [
    { table: 'stock_events', values: {
      id: eventId, event_date: a.date, event_type: 'arrival', reason: a.reason, to_property_id: a.toPropertyId,
      average_weight_kg: avgWeight(a.movement.totalWeightKg, head), ...movementValues(a.movement),
    } },
    ...a.lines.filter((l) => l.head > 0).map((l) => ({ table: 'stock_event_lines', values: { stock_event_id: eventId, mob_id: a.mobId, livestock_class_id: l.classId, head_change: l.head } })),
    ...priceRecord(eventId, a.movement),
  ]
}
