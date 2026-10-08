import { describe, expect, it } from 'vitest'
import { jobProgress, sprayPlan } from './land'

describe('part sprays and job progress', () => {
  it('a paddock done in part (rain) shows part; a later full run makes it done', () => {
    const d = {
      sprays: [{ id: 's1', job_id: 'j' }, { id: 's2', job_id: 'j' }, { id: 'other', job_id: 'x' }],
      sprayLinks: [
        { spray_record_id: 's1', paddock_id: 'A', coverage: 'part', area_done_ha: 12, part_reason: 'Rain' },
        { spray_record_id: 's1', paddock_id: 'B', coverage: 'full' },
        { spray_record_id: 'other', paddock_id: 'C', coverage: 'full' },
      ],
      pastures: [], pastureLinks: [],
    }
    const p = jobProgress('j', ['A', 'B', 'C'], d)
    expect(p.get('A')).toEqual({ status: 'part', areaDone: 12, reasons: ['Rain'] })
    expect(p.get('B')!.status).toBe('done')
    expect(p.get('C')!.status).toBe('todo')
    d.sprayLinks.push({ spray_record_id: 's2', paddock_id: 'A', coverage: 'full' })
    expect(jobProgress('j', ['A'], d).get('A')!.status).toBe('done')
  })

  it('saves coverage on new paddock links and updates it on kept ones', () => {
    const base = { date: '2026-10-08', startTime: '', finishTime: '', propertyId: 'p', situation: '', target: '', waterRate: '', areaHa: null, wind: '', temperatureC: null, humidity: '', equipment: '', applicatorUserId: null, applicatorName: '', licence: '', jobId: null, contractorEntered: false, notes: '', items: [] }
    const plan = sprayPlan({ ...base, paddockIds: ['A', 'B'], coverage: { A: { part: true, areaHa: 8, reason: 'Wind' } } })
    const links = plan.adds.filter((a) => a.table === 'spray_record_paddocks').map((a) => a.values)
    expect(links).toEqual([
      { spray_record_id: plan.id, paddock_id: 'A', coverage: 'part', area_done_ha: 8, part_reason: 'Wind' },
      { spray_record_id: plan.id, paddock_id: 'B', coverage: 'full', area_done_ha: null, part_reason: null },
    ])
    const existing = [{ id: 'l1', spray_record_id: 's', paddock_id: 'A', coverage: 'part', area_done_ha: 8, part_reason: 'Wind' }]
    const again = sprayPlan({ ...base, id: 's', paddockIds: ['A'], coverage: { A: { part: false, areaHa: null, reason: '' } } }, { paddocks: existing, items: [] })
    expect(again.edits.find((e) => e.table === 'spray_record_paddocks')).toMatchObject({ id: 'l1', changes: { coverage: 'full', area_done_ha: null, part_reason: null } })
  })
})
