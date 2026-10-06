import { beforeEach, describe, expect, it } from 'vitest'
import type { Row } from './db'
import type { NewRecord, RecordEdit } from './sync'
import {
  classHeads, countPlan, currentLocations, mobHeads, mobHistory, movePlan, newMobPlan, openRecounts, type StockData,
} from './stock'

// Apply a plan the way saving would, into an in-memory copy of the records.
let s: StockData
let clock = 0
const tableKey: Record<string, keyof StockData> = { mobs: 'mobs', stock_events: 'events', stock_event_lines: 'lines', mob_location_changes: 'locations' }
function apply(plan: { adds: NewRecord[]; edits?: RecordEdit[] }) {
  for (const a of plan.adds) {
    const row: Row = { id: crypto.randomUUID(), ...a.values, recorded_at: new Date(Date.UTC(2026, 9, 1) + ++clock * 1000).toISOString() }
    s[tableKey[a.table]].push(row)
  }
  for (const e of plan.edits ?? []) {
    const list = s[tableKey[e.table]]
    const i = list.findIndex((r) => r.id === e.id)
    list[i] = { ...list[i], ...e.changes, updated_at: 'now' }
  }
}

const PROP = 'prop-1'
const OTHER_PROP = 'prop-2'
const CREEK = 'creek'
const MIDDLE = 'middle'
const HEIFERS_CLASS = 'class-heifers'
const names = {
  paddock: (id: string | null) => ({ [CREEK]: 'Creek', [MIDDLE]: 'Middle' } as Record<string, string>)[id ?? ''] ?? 'Elsewhere',
  mob: (id: string) => String(s.mobs.find((m) => m.id === id)?.name),
}

function addHeifers(date = '2026-10-01') {
  const plan = newMobPlan({ name: 'Yellow tag heifers', species: 'cattle', classId: HEIFERS_CLASS, head: 50, propertyId: PROP, paddockId: CREEK, date, how: 'on_hand' })
  apply(plan)
  return plan.mobId
}

beforeEach(() => { s = { mobs: [], events: [], lines: [], locations: [] }; clock = 0 })

describe('a new mob', () => {
  it('starts with its count, in its paddock', () => {
    const mob = addHeifers()
    expect(mobHeads(s).get(mob)).toBe(50)
    expect(currentLocations(s).get(mob)).toMatchObject({ propertyId: PROP, paddockId: CREEK, since: '2026-10-01' })
    expect(classHeads(s, mob).get(HEIFERS_CLASS)).toBe(50)
    expect(s.events[0]).toMatchObject({ event_type: 'count_adjustment', reason: 'opening_count' })
  })

  it('records bought stock as an arrival with the NVD', () => {
    const plan = newMobPlan({ name: 'Trade steers', species: 'cattle', classId: null, head: 20, propertyId: PROP, paddockId: MIDDLE, date: '2026-10-02', how: 'purchase', nvd: '1234567' })
    apply(plan)
    expect(s.events[0]).toMatchObject({ event_type: 'arrival', reason: 'purchase', nvd_number: '1234567' })
    expect(mobHistory(s, plan.mobId, names)[0].text).toBe('Bought: 20 head into Middle · NVD 1234567')
  })
})

describe('moving', () => {
  it('moves the mob, keeping the book count when the count matches', () => {
    const mob = addHeifers()
    const from = currentLocations(s).get(mob)!
    apply(movePlan({ mobId: mob, date: '2026-10-04', from, to: { propertyId: PROP, paddockId: MIDDLE }, book: 50, counted: 50, outcome: { kind: 'match' }, openRecounts: [] }))
    expect(currentLocations(s).get(mob)?.paddockId).toBe(MIDDLE)
    expect(mobHeads(s).get(mob)).toBe(50)
    expect(mobHistory(s, mob, names)[0].text).toBe('Moved Creek → Middle · counted 50 of 50')
  })

  it('2 short, recount later: book stays at 50 and a recount is due', () => {
    const mob = addHeifers()
    apply(movePlan({ mobId: mob, date: '2026-10-04', from: currentLocations(s).get(mob)!, to: { propertyId: PROP, paddockId: MIDDLE }, book: 50, counted: 48, outcome: { kind: 'recount_later' }, openRecounts: [] }))
    expect(mobHeads(s).get(mob)).toBe(50)
    expect(openRecounts(s, mob)).toHaveLength(1)
  })

  it('2 short, accepted as dead: a death record takes the mob to 48', () => {
    const mob = addHeifers()
    apply(movePlan({ mobId: mob, date: '2026-10-04', from: currentLocations(s).get(mob)!, to: { propertyId: PROP, paddockId: MIDDLE }, book: 50, counted: 48, outcome: { kind: 'accept', reason: 'dead_found', classId: HEIFERS_CLASS }, openRecounts: [] }))
    expect(mobHeads(s).get(mob)).toBe(48)
    const death = s.events.find((e) => e.event_type === 'death')!
    expect(death.related_event_id).toBe(s.events.find((e) => e.event_type === 'paddock_move')!.id)
    expect(mobHistory(s, mob, names).map((h) => h.text)).toContain('2 dead (dead found)')
  })

  it('2 extra that were boxed from another mob: moved across, totals still add up', () => {
    const mob = addHeifers()
    const steers = newMobPlan({ name: 'Steers', species: 'cattle', classId: 'class-steers', head: 30, propertyId: PROP, paddockId: MIDDLE, date: '2026-10-01', how: 'on_hand' })
    apply(steers)
    apply(movePlan({ mobId: mob, date: '2026-10-04', from: currentLocations(s).get(mob)!, to: { propertyId: PROP, paddockId: MIDDLE }, book: 50, counted: 52,
      outcome: { kind: 'accept', reason: 'boxed_with_other_mob', classId: HEIFERS_CLASS, otherMobId: steers.mobId, otherClassId: 'class-steers' }, openRecounts: [] }))
    expect(mobHeads(s).get(mob)).toBe(52)
    expect(mobHeads(s).get(steers.mobId)).toBe(28)
    expect(s.events.at(-1)?.event_type).toBe('transfer_between_mobs')
    expect(mobHistory(s, steers.mobId, names)[0].text).toBe('2 head were with Yellow tag heifers')
  })

  it('carries the NVD only when moving to another property', () => {
    const mob = addHeifers()
    const plan = movePlan({ mobId: mob, date: '2026-10-04', from: currentLocations(s).get(mob)!, to: { propertyId: OTHER_PROP, paddockId: null }, book: 50, counted: 50, outcome: { kind: 'match' }, nvd: '7654321', openRecounts: [] })
    expect(plan.adds[0].values).toMatchObject({ from_property_id: PROP, to_property_id: OTHER_PROP, nvd_number: '7654321' })
    const same = movePlan({ mobId: mob, date: '2026-10-04', from: currentLocations(s).get(mob)!, to: { propertyId: PROP, paddockId: MIDDLE }, book: 50, counted: 50, outcome: { kind: 'match' }, nvd: '7654321', openRecounts: [] })
    expect(same.adds[0].values.nvd_number).toBeNull()
  })
})

describe('counting and recounts', () => {
  it('a later count closes the recount, and records what was found', () => {
    const mob = addHeifers()
    apply(movePlan({ mobId: mob, date: '2026-10-04', from: currentLocations(s).get(mob)!, to: { propertyId: PROP, paddockId: MIDDLE }, book: 50, counted: 48, outcome: { kind: 'recount_later' }, openRecounts: [] }))
    apply(countPlan({ mobId: mob, date: '2026-10-06', book: 50, counted: 49, outcome: { kind: 'accept', reason: 'missing', classId: HEIFERS_CLASS }, openRecounts: openRecounts(s, mob) }))
    expect(openRecounts(s, mob)).toHaveLength(0)
    expect(mobHeads(s).get(mob)).toBe(49)
    const texts = mobHistory(s, mob, names).map((h) => h.text)
    expect(texts[0]).toMatch(/^(Counted 49 \(book 50\)|Count −1 \(missing\))$/)
    expect(texts).toContain('Count −1 (missing)')
  })

  it('a count that matches is still recorded in the history', () => {
    const mob = addHeifers()
    apply(countPlan({ mobId: mob, date: '2026-10-06', book: 50, counted: 50, outcome: { kind: 'match' }, openRecounts: [] }))
    expect(mobHeads(s).get(mob)).toBe(50)
    expect(mobHistory(s, mob, names)[0].text).toBe('Counted 50 (book 50)')
  })
})

describe('corrections', () => {
  it('deleting a record takes it out of the head count and location', () => {
    const mob = addHeifers()
    apply(movePlan({ mobId: mob, date: '2026-10-04', from: currentLocations(s).get(mob)!, to: { propertyId: PROP, paddockId: MIDDLE }, book: 50, counted: 48, outcome: { kind: 'accept', reason: 'dead_found', classId: HEIFERS_CLASS }, openRecounts: [] }))
    const move = s.events.find((e) => e.event_type === 'paddock_move')!
    const death = s.events.find((e) => e.event_type === 'death')!
    apply({ adds: [], edits: [
      { table: 'stock_events', id: String(move.id), changes: { deleted_at: 'now' } },
      { table: 'stock_events', id: String(death.id), changes: { deleted_at: 'now' } },
    ] })
    expect(currentLocations(s).get(mob)?.paddockId).toBe(CREEK)
    expect(mobHeads(s).get(mob)).toBe(50)
  })

  it('a move entered late with an earlier date does not override a later move', () => {
    const mob = addHeifers()
    apply(movePlan({ mobId: mob, date: '2026-10-05', from: currentLocations(s).get(mob)!, to: { propertyId: PROP, paddockId: MIDDLE }, book: 50, counted: 50, outcome: { kind: 'match' }, openRecounts: [] }))
    apply(movePlan({ mobId: mob, date: '2026-10-03', from: null, to: { propertyId: PROP, paddockId: CREEK }, book: 50, counted: 50, outcome: { kind: 'match' }, openRecounts: [] }))
    expect(currentLocations(s).get(mob)?.paddockId).toBe(MIDDLE)
  })
})
