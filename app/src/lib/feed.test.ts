import { describe, expect, it } from 'vitest'
import { currentRation, feedStock, feedingPlan, suggestFeeding, type FeedData } from './feed'

function data(): FeedData {
  return {
    items: [{ id: 'hay', name: 'Pasture hay', unit: 'round_bale', kg_per_unit: 400 }, { id: 'lick', name: 'Lick', unit: 'kg' }],
    lots: [{ id: 'lot1', feed_item_id: 'hay', received_date: '2026-03-01' }, { id: 'lot2', feed_item_id: 'lick', received_date: '2026-09-01' }],
    ledger: [
      { id: 'l1', feed_lot_id: 'lot1', storage_site_id: 'shed', entry_type: 'purchased', quantity: 100 },
      { id: 'l2', feed_lot_id: 'lot2', storage_site_id: 'shed', entry_type: 'purchased', quantity: 500 },
    ],
    sites: [{ id: 'shed', name: 'Hay shed' }],
    rations: [{ id: 'r1', name: 'Hay + lick' }],
    rationItems: [{ id: 'ri1', ration_id: 'r1', feed_item_id: 'hay', kg_per_head_per_day: 6 }, { id: 'ri2', ration_id: 'r1', feed_item_id: 'lick', kg_per_head_per_day: 0.1 }],
    assignments: [{ id: 'a1', ration_id: 'r1', mob_id: 'heifers', start_date: '2026-10-01', end_date: null }],
  }
}
const heads = new Map([['heifers', 50]])

describe('feed', () => {
  it('100 round bales of 400 kg, 50 head at 6 kg/hd/day: 133 days of hay', () => {
    const all = feedStock(data(), heads, '2026-10-10')
    const hay = all.find((x) => x.id === 'hay')
    const lick = all.find((x) => x.id === 'lick')
    expect(hay).toMatchObject({ onHand: 100, onHandKg: 40000, kgPerDay: 300, daysLeft: 133 })
    expect(lick).toMatchObject({ onHand: 500, kgPerDay: 5, daysLeft: 100 })
  })

  it('no daily use before the ration starts or after it ends', () => {
    expect(feedStock(data(), heads, '2026-09-30').find((x) => x.id === 'hay')?.daysLeft).toBeNull()
    const d = data()
    d.assignments[0].end_date = '2026-10-05'
    expect(feedStock(d, heads, '2026-10-10').find((x) => x.id === 'hay')?.daysLeft).toBeNull()
    expect(currentRation(d, 'heifers', '2026-10-03')?.name).toBe('Hay + lick')
  })

  it('feeding suggests ration x head in each unit (bales whole), and draws the stock down', () => {
    const d = data()
    const stock = feedStock(d, heads, '2026-10-10')
    const lines = suggestFeeding(d, stock, 'r1', 50)
    expect(lines).toEqual([
      { itemId: 'hay', lotId: 'lot1', siteId: 'shed', quantity: 1 },
      { itemId: 'lick', lotId: 'lot2', siteId: 'shed', quantity: 5 },
    ])
    const adds = feedingPlan({ mobId: 'heifers', date: '2026-10-10', rationId: 'r1', head: 50, paddockId: null, notes: null, lines })
    d.ledger.push(...adds.filter((a) => a.table === 'feed_ledger').map((a, i) => ({ id: `f${i}`, ...a.values })))
    expect(feedStock(d, heads, '2026-10-10').find((x) => x.id === 'hay')?.onHand).toBe(99)
    d.feedings = [{ ...adds[0].values, deleted_at: 'now' }]
    expect(feedStock(d, heads, '2026-10-10').find((x) => x.id === 'hay')?.onHand).toBe(100)
  })

  it('2 round bales to the mob every 2 days: 1 bale a day, 100 days; suggests 2 bales', () => {
    const d = data()
    d.rations[0].feed_every_days = 2
    d.rationItems = [{ id: 'ri1', ration_id: 'r1', feed_item_id: 'hay', amount: 2, amount_basis: 'units_per_mob', kg_per_head_per_day: null }]
    const hay = feedStock(d, heads, '2026-10-10').find((x) => x.id === 'hay')
    expect(hay).toMatchObject({ kgPerDay: 400, daysLeft: 100 })
    expect(suggestFeeding(d, feedStock(d, heads, '2026-10-10'), 'r1', 50)[0].quantity).toBe(2)
  })

  it('kg per head fed weekly: a week of feed at once, spread over 7 days for days left', () => {
    const d = data()
    d.rations[0].feed_every_days = 7
    d.rationItems = [{ id: 'ri2', ration_id: 'r1', feed_item_id: 'lick', amount: 0.7, amount_basis: 'kg_per_head', kg_per_head_per_day: 0.1 }]
    expect(feedStock(d, heads, '2026-10-10').find((x) => x.id === 'lick')).toMatchObject({ kgPerDay: 5, daysLeft: 100 })
    expect(suggestFeeding(d, feedStock(d, heads, '2026-10-10'), 'r1', 50)[0].quantity).toBe(35)
  })

  it('bales with no kg per bale in a kg ration: days left unknown', () => {
    const d = data()
    d.items[0].kg_per_unit = null
    const hay = feedStock(d, heads, '2026-10-10').find((x) => x.id === 'hay')
    expect(hay?.daysLeft).toBeNull()
    expect(hay?.kgPerDay).toBeGreaterThan(0)
  })
})
