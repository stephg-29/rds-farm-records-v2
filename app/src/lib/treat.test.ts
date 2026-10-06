import { describe, expect, it } from 'vitest'
import { treatmentPlan, type TreatmentInput } from './treat'

const base = (): TreatmentInput => ({
  date: '2026-10-16', mobId: 'weaners', propertyId: 'prop', paddockId: 'pdk', headTreated: 64, description: 'Weaner steers',
  treatedByUserId: 'me', treatedByName: 'Steph', treatedByPhone: '', equipmentCleaned: true, equipmentCleanedBy: '', notes: '',
  items: [{ productId: 'cydectin', batchId: 'b1', doseRate: '1 mL/10 kg', weightKg: 280, route: 'Pour-on / topical', quantityUsed: 1.79,
    reason: 'Worms', whpDays: 42, esiDays: 42, adverseReactions: '', brokenNeedle: false }],
})

describe('treatment records', () => {
  it('a new treatment: the treatment and its items, with withhold dates', () => {
    const p = treatmentPlan(base())
    expect(p.adds).toHaveLength(2)
    expect(p.adds[1].values).toMatchObject({ treatment_id: p.treatmentId, whp_until: '2026-11-27', esi_until: '2026-11-27', batch_id: 'b1' })
  })

  it('editing: changed date moves the withhold dates; a removed product is deleted', () => {
    const t = { ...base(), id: 't1', date: '2026-10-20' }
    t.items[0].id = 'i1'
    const p = treatmentPlan(t, [{ id: 'i1' }, { id: 'i2' }], 'Wrong day')
    expect(p.adds).toHaveLength(0)
    expect(p.edits.find((e) => e.id === 'i1')?.changes).toMatchObject({ whp_until: '2026-12-01' })
    expect(p.edits.find((e) => e.id === 'i2')?.changes.deleted_at).toBeTruthy()
    expect(p.edits.every((e) => e.reason === 'Wrong day')).toBe(true)
  })
})
