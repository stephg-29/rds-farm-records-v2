import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { FarmDb } from '../lib/db'
import { addRecord, editRecord, syncNow } from '../lib/sync'
import { bringDemoUpToDate, daysFrom, demoRemote, seedDemo, shiftRow, type DemoData } from './demo'
import real from './demoData.json'

const data = real as unknown as DemoData

describe('demo farm', () => {
  it('moves dates and times on, and leaves everything else alone', () => {
    const r = shiftRow({ d: '2026-10-10', t: '2026-10-04T09:00:00+00:00', n: 3, s: 'Ridge', ref: 'dea:ga_s2m_ard_3:2026-10-04', ids: ['a', 'b'] }, 5)
    expect(r).toEqual({ d: '2026-10-15', t: '2026-10-09T09:00:00.000Z', n: 3, s: 'Ridge', ref: 'dea:ga_s2m_ard_3:2026-10-04', ids: ['a', 'b'] })
    expect(daysFrom('2026-10-10', '2026-11-01')).toBe(22)
  })

  it('is about 500 ha of sheep and cattle, with treatments, sprays and pasture records', () => {
    const ha = data.tables.paddocks.reduce((n, p) => n + Number(p.area_ha), 0)
    expect(Math.round(ha)).toBeGreaterThan(490)
    expect(Math.round(ha)).toBeLessThan(510)
    expect(new Set(data.tables.mobs.map((m) => m.species))).toEqual(new Set(['sheep', 'cattle']))
    for (const t of ['treatments', 'spray_records', 'pasture_records', 'jobs', 'paddock_joins', 'joinings', 'readings', 'issues']) expect(data.tables[t].length).toBeGreaterThan(0)
    expect(data.views.farm_modules.length).toBeGreaterThan(10)
  })

  it('seeds the phone dated as of today, and catches up on a later day', async () => {
    const db = new FarmDb('demo-test-1')
    await seedDemo(db, data, '2026-12-01')
    const shift = daysFrom(data.builtOn, '2026-12-01')
    const t = (await db.rows.where('table').equals('treatments').toArray()).map((r) => r.data)
    const first = data.tables.treatments[0]
    expect(t.find((x) => x.id === first.id)?.treatment_date).toBe(shiftRow(first, shift).treatment_date)
    await bringDemoUpToDate(db, '2026-12-03')
    const again = (await db.rows.get(['treatments', String(first.id)]))!.data
    expect(again.treatment_date).toBe(shiftRow(first, shift + 2).treatment_date)
  })

  it('takes changes like a database would, and sends nothing anywhere', async () => {
    const db = new FarmDb('demo-test-2')
    await seedDemo(db, data, data.builtOn)
    const ctx = { db, remote: demoRemote(db), userId: data.userId, deviceId: 'phone' }
    const id = await addRecord(ctx, 'issues', { categories: ['Fence'], notes: 'Gate off its hinges', status: 'new' })
    const mob = data.tables.mobs[0]
    await editRecord(ctx, 'mobs', String(mob.id), { name: 'Renamed mob' })
    const r = await syncNow(ctx)
    expect(r.offline).toBe(false)
    expect(await db.outbox.count()).toBe(0)
    expect((await db.rows.get(['issues', id]))?.server?.notes).toBe('Gate off its hinges')
    expect((await db.rows.get(['mobs', String(mob.id)]))?.data.name).toBe('Renamed mob')
    expect((await db.rows.get(['mobs', String(mob.id)]))?.data.species).toBe(mob.species)
  })
})
