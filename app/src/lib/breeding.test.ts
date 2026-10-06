import { describe, expect, it } from 'vitest'
import { expectedBirths, joiningValues, markingPlan } from './breeding'

describe('breeding', () => {
  it('cattle joined 1 Nov to 31 Dec calve from 11 Aug to 10 Oct (283 days)', () => {
    expect(expectedBirths('2026-11-01', '2026-12-31', 'cattle', null)).toEqual({ from: '2027-08-11', to: '2027-10-10' })
    expect(joiningValues({ mobId: 'm', species: 'sheep', sireMobId: null, sireDescription: 'Poll Dorset rams', paddockId: null, start: '2026-11-01', end: '', notes: '' }, { sheep: 147 }))
      .toMatchObject({ expected_birth_start: '2027-03-28', expected_birth_end: '2027-03-28', end_date: null })
  })

  it('marking adds the young to the mob and keeps the counts', () => {
    const adds = markingPlan({ mobId: 'cows', date: '2027-09-20', joiningId: 'j1', males: 20, females: 22, maleClassId: 'calf', femaleClassId: 'calf', notes: '' })
    expect(adds[0].values).toMatchObject({ event_type: 'birth_marking' })
    expect(adds.filter((a) => a.table === 'stock_event_lines').reduce((n, a) => n + Number(a.values.head_change), 0)).toBe(42)
    expect(adds.at(-1)).toMatchObject({ table: 'birth_markings', values: { males: 20, females: 22, joining_id: 'j1' } })
  })
})
