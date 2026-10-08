import { describe, expect, it } from 'vitest'
import { closeGatePlan, groupOf, joinedWith, openGatePlan, paddockRestJoined } from './joins'
import { partTreated } from './treat'

describe('part-treated mobs', () => {
  const items = [{ treatment_id: 't1', product_id: 'cyd' }]
  const name = () => 'Cydectin'
  it('18 of 20 treated: 2 still to treat; a later rest treatment clears it', () => {
    const t = [{ id: 't1', mob_id: 'm', treatment_date: '2026-10-08', head_treated: 18, mob_head: 20 }]
    expect(partTreated(t, items, () => 20, name)).toMatchObject([{ mobId: 'm', remaining: 2, ofHead: 20, products: ['Cydectin'] }])
    const withRest = [...t, { id: 't2', mob_id: 'm', treatment_date: '2026-10-10', head_treated: 2, follow_up_of: 't1' }]
    expect(partTreated(withRest, items, () => 20, name)).toEqual([])
  })
  it('cleared by "not needed", by the whole mob being treated, or once the mob is gone', () => {
    expect(partTreated([{ id: 't1', mob_id: 'm', head_treated: 18, mob_head: 20, rest_not_needed: true }], items, () => 20, name)).toEqual([])
    expect(partTreated([{ id: 't1', mob_id: 'm', head_treated: 20, mob_head: 20 }], items, () => 20, name)).toEqual([])
    expect(partTreated([{ id: 't1', mob_id: 'm', head_treated: 18, mob_head: 20 }], items, () => 0, name)).toEqual([])
    // Most of the mob sold: never more still to treat than are left.
    expect(partTreated([{ id: 't1', mob_id: 'm', head_treated: 18, mob_head: 20 }], items, () => 1, name)[0].remaining).toBe(1)
  })
})

describe('paddocks joined by an open gate', () => {
  const data = {
    mobs: [{ id: 'cows' }],
    events: [{ id: 'e1', event_date: '2026-09-01' }],
    lines: [{ stock_event_id: 'e1', mob_id: 'cows', head_change: 30 }],
    locations: [{ stock_event_id: 'e1', mob_id: 'cows', paddock_id: 'front' }],
  }
  const heads = new Map([['cows', 30]])
  const joins = [{ id: 'j', property_id: 'p', paddock_ids: ['front', 'back'], opened_on: '2026-10-01', closed_on: null }]
  it('a mob in Front grazes Back too while the gate is open', () => {
    expect(joinedWith(joins, 'back')).toEqual(['front'])
    expect(groupOf(joins, 'front')).toEqual(['front', 'back'])
    expect(paddockRestJoined(data, joins, 'back', '2026-10-08', heads).grazing).toEqual(['cows'])
    expect(paddockRestJoined(data, [{ ...joins[0], closed_on: '2026-10-05' }], 'back', '2026-10-08', heads).grazing).toEqual([])
  })
  it('opening a gate joins paddocks (adding to an open join); closing takes a paddock out', () => {
    expect(openGatePlan([], 'p', 'front', ['back'], '2026-10-08').adds[0].values).toEqual({ property_id: 'p', paddock_ids: ['front', 'back'], opened_on: '2026-10-08' })
    const more = openGatePlan(joins, 'p', 'back', ['creek'], '2026-10-08')
    expect(more.adds).toEqual([])
    expect(more.edits[0]).toEqual({ table: 'paddock_joins', id: 'j', changes: { paddock_ids: ['back', 'creek', 'front'] } })
    expect(closeGatePlan(joins, 'back', '2026-10-09')).toEqual([{ table: 'paddock_joins', id: 'j', changes: { closed_on: '2026-10-09' } }])
    const three = [{ ...joins[0], paddock_ids: ['front', 'back', 'creek'] }]
    expect(closeGatePlan(three, 'creek', '2026-10-09')).toEqual([{ table: 'paddock_joins', id: 'j', changes: { paddock_ids: ['front', 'back'] } }])
  })
})
