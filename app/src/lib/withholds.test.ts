import { describe, expect, it } from 'vitest'
import type { Row } from './db'
import { activeWithholds, addDays, exitBreach, mobWithholds, type WithholdData } from './withholds'

const product: Row = { id: 'cydectin', name: 'Cydectin Pour-On' }
function data(): WithholdData {
  return {
    products: [product],
    treatments: [{ id: 't1', mob_id: 'heifers', treatment_date: '2026-10-01' }],
    items: [{ id: 'i1', treatment_id: 't1', product_id: 'cydectin', whp_days: 42, esi_days: 42 }],
    events: [],
    lines: [],
  }
}
const split = (d: WithholdData, date: string, choice: string | null, type = 'split') => {
  d.events.push({ id: `e-${date}`, event_type: type, event_date: date })
  d.lines.push({ id: 'l1', stock_event_id: `e-${date}`, mob_id: 'heifers', head_change: -20 })
  d.lines.push({ id: 'l2', stock_event_id: `e-${date}`, mob_id: 'new-mob', head_change: 20, withhold_choice: choice })
}

describe('withholds', () => {
  it('lasts until treatment date + WHP days (the last day under withhold)', () => {
    const w = mobWithholds(data())
    expect(w[0]).toMatchObject({ mobId: 'heifers', whpUntil: '2026-11-12', esiUntil: '2026-11-12' })
    expect(addDays('2026-10-01', 42)).toBe('2026-11-12')
    expect(activeWithholds(w, '2026-11-12').has('heifers')).toBe(true)
    expect(activeWithholds(w, '2026-11-13').has('heifers')).toBe(false)
  })

  it('follows stock into a split-off mob when applied', () => {
    const d = data()
    split(d, '2026-10-10', 'applied')
    const w = mobWithholds(d)
    expect(activeWithholds(w, '2026-10-20').has('new-mob')).toBe(true)
    expect(activeWithholds(w, '2026-10-05').has('new-mob')).toBe(false) // only from the split date
  })

  it('does not follow when the user chose not to apply it', () => {
    const d = data()
    split(d, '2026-10-10', 'not_applied')
    expect(activeWithholds(mobWithholds(d), '2026-10-20').has('new-mob')).toBe(false)
  })

  it('does not follow a split made after the withhold ended, or a plain move', () => {
    const d = data()
    split(d, '2026-12-01', 'applied')
    expect(mobWithholds(d).some((w) => w.mobId === 'new-mob')).toBe(false)
    const d2 = data()
    split(d2, '2026-10-10', 'applied', 'paddock_move')
    expect(mobWithholds(d2).some((w) => w.mobId === 'new-mob')).toBe(false)
  })

  it('ignores deleted treatments and deleted splits', () => {
    const d = data()
    d.treatments[0].deleted_at = 'now'
    expect(mobWithholds(d)).toHaveLength(0)
    const d2 = data()
    split(d2, '2026-10-10', 'applied')
    d2.events[0].deleted_at = 'now'
    expect(mobWithholds(d2).some((w) => w.mobId === 'new-mob')).toBe(false)
  })

  it('flags a sale inside the WHP; ESI only counts for export or unknown markets', () => {
    const d = data()
    d.items[0].whp_days = 7
    d.items[0].esi_days = 42
    const w = mobWithholds(d)
    expect(exitBreach(w, 'heifers', '2026-10-05', 'domestic')).not.toBeNull()
    expect(exitBreach(w, 'heifers', '2026-10-20', 'domestic')).toBeNull()
    expect(exitBreach(w, 'heifers', '2026-10-20', 'export')).not.toBeNull()
    expect(exitBreach(w, 'heifers', '2026-10-20', 'unknown')).not.toBeNull()
  })
})

describe('medicated feed', () => {
  it('feeding a lick with a WHP puts the mob under withhold', () => {
    const d = data()
    d.items = []
    d.feedItems = [{ id: 'lick', name: 'Medicated lick', whp_days: 14, esi_days: null }]
    d.feedLots = [{ id: 'lot', feed_item_id: 'lick' }]
    d.feedings = [{ id: 'fe', mob_id: 'heifers', feed_date: '2026-10-01' }]
    d.feedLedger = [{ id: 'fl', feed_lot_id: 'lot', feeding_event_id: 'fe', entry_type: 'fed_out', quantity: -1 }]
    const a = activeWithholds(mobWithholds(d), '2026-10-10').get('heifers')
    expect(a).toMatchObject({ whpUntil: '2026-10-15', products: ['Medicated lick'] })
  })
})
