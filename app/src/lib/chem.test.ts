import { describe, expect, it } from 'vitest'
import { chemicalStock, type ChemData } from './chem'

function data(): ChemData {
  return {
    products: [{ id: 'p', name: 'Cydectin Pour-On', product_kind: 'animal_treatment', stock_unit: 'L' }],
    batches: [{ id: 'b', product_id: 'p', batch_number: '4471K', expiry_date: '2027-03-31' }],
    ledger: [
      { id: 'r', batch_id: 'b', entry_date: '2026-10-02', entry_type: 'received', quantity: 3 },
      { id: 'w', batch_id: 'b', entry_date: '2026-09-20', entry_type: 'written_off', write_off_reason: 'leaked_spilled', quantity: -0.4 },
    ],
    treatments: [{ id: 't', mob_id: 'weaners', treatment_date: '2026-10-16' }],
    items: [{ id: 'i', treatment_id: 't', product_id: 'p', batch_id: 'b', quantity_used: 1.79 }],
  }
}
const stock = (d: ChemData) => chemicalStock(d, '2026-10-16', '2026-11-15', () => 'Weaner steers')

describe('chemical stock', () => {
  it('received 3 L, wrote off 0.4 L, used 1.79 L: 0.81 L on hand', () => {
    const [p] = stock(data())
    expect(p.onHand).toBe(0.81)
    expect(p.batches[0].entries.map((e) => e.text)).toEqual(['Used on Weaner steers', 'Received', 'Written off: leaked or spilled'])
  })

  it('does not count the database\'s own "used" line twice', () => {
    const d = data()
    d.ledger.push({ id: 'u', batch_id: 'b', entry_date: '2026-10-16', entry_type: 'used', quantity: -1.79, source_table: 'treatment_items', source_id: 'i' })
    expect(stock(d)[0].onHand).toBe(0.81)
  })

  it('a deleted treatment gives the chemical back', () => {
    const d = data()
    d.treatments[0].deleted_at = 'now'
    expect(stock(d)[0].onHand).toBe(2.6)
  })

  it('flags below zero for a stocktake, and batches expiring soon', () => {
    const d = data()
    d.items[0].quantity_used = 5
    d.batches[0].expiry_date = '2026-11-01'
    const [p] = stock(d)
    expect(p.needsStocktake).toBe(true)
    expect(p.batches[0].expiringSoon).toBe(true)
  })
})
