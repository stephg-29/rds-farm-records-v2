import { describe, expect, it } from 'vitest'
import { paddockHistory, pasturePlan, sprayPlan, type SprayInput } from './land'

const spray = (): SprayInput => ({
  date: '2026-10-10', startTime: '07:30', finishTime: '09:00', propertyId: 'prop', paddockIds: ['creek', 'middle'],
  situation: 'Pasture', target: 'Thistles', waterRate: '80 L/ha', areaHa: 42, wind: '8 km/h NE', temperatureC: 18, humidity: '60%',
  equipment: 'Boom spray', applicatorUserId: 'me', applicatorName: 'Steph', licence: 'L123', jobId: null, contractorEntered: false, notes: '',
  items: [
    { productId: 'amine', productName: null, batchId: 'b1', batchNumber: null, expiryDate: null, rate: '1.5 L/ha', quantityUsed: 63, grazingWhpDays: 7, harvestWhpDays: null },
    { productId: null, productName: 'Contractor wetter', batchId: null, batchNumber: 'W9', expiryDate: null, rate: '0.1%', quantityUsed: null, grazingWhpDays: 14, harvestWhpDays: 28 },
  ],
})

describe('spray records', () => {
  it('grazing withhold is the longest WHP in the mix', () => {
    const p = sprayPlan(spray())
    expect(p.adds[0].values).toMatchObject({ grazing_withhold_until: '2026-10-24', harvest_withhold_until: '2026-11-07', equipment: 'Boom spray', finish_time: '09:00' })
    expect(p.adds.filter((a) => a.table === 'spray_record_paddocks')).toHaveLength(2)
    expect(p.adds.find((a) => a.table === 'spray_record_items' && a.values.product_name === 'Contractor wetter')).toBeTruthy()
  })

  it('editing swaps paddocks: adds the new one, deletes the dropped one', () => {
    const s = { ...spray(), id: 's1', paddockIds: ['creek', 'top'] }
    const p = sprayPlan(s, { paddocks: [{ id: 'l1', spray_record_id: 's1', paddock_id: 'creek' }, { id: 'l2', spray_record_id: 's1', paddock_id: 'middle' }], items: [] })
    expect(p.adds.filter((a) => a.table === 'spray_record_paddocks').map((a) => a.values.paddock_id)).toEqual(['top'])
    expect(p.edits.find((e) => e.id === 'l2')?.changes.deleted_at).toBeTruthy()
  })
})

describe('pasture and fertiliser', () => {
  it('whole-property records have no paddock links and show in every paddock history', () => {
    const p = pasturePlan({ date: '2026-04-12', type: 'fertiliser', propertyId: 'prop', wholeProperty: true, paddockIds: ['creek'], areaHa: 100, overallRate: '125 kg/ha',
      contractorContactId: null, jobId: null, contractorEntered: false, notes: '', items: [{ kind: 'fertiliser', productId: 'super', productName: null, batchId: null, speciesName: null, rate: '125 kg/ha', quantityUsed: 12.5 }] })
    expect(p.adds.some((a) => a.table === 'pasture_record_paddocks')).toBe(false)
    const h = paddockHistory('creek', 'prop', {
      sprays: [], sprayPaddocks: [], sprayItems: [], issues: [], grazing: [], productName: () => 'Single super',
      pastures: [{ id: p.id, ...p.adds[0].values }], pasturePaddocks: [], pastureItems: p.adds.filter((a) => a.table === 'pasture_record_items').map((a) => ({ ...a.values })),
    })
    expect(h[0]).toMatchObject({ kind: 'fertiliser', text: 'Fertiliser: Single super 125 kg/ha' })
  })
})
