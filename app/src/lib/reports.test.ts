import { describe, expect, it } from 'vitest'
import type { Row } from './db'
import { financialYear, movementRegister, reconciliation, toCsv } from './reports'
import type { StockData } from './stock'

const ev = (id: string, type: string, date: string, extra: Row = {}): Row => ({ id, event_type: type, event_date: date, ...extra })
const ln = (event: string, mob: string, cls: string, head: number): Row => ({ id: `${event}-${mob}-${cls}`, stock_event_id: event, mob_id: mob, livestock_class_id: cls, head_change: head })

function data(): StockData {
  return {
    mobs: [{ id: 'cows', name: 'Cows', species: 'cattle' }, { id: 'steers', name: 'Trade steers', species: 'cattle' }],
    events: [
      ev('open', 'count_adjustment', '2025-06-30', { reason: 'opening_count' }),
      ev('buy', 'arrival', '2025-08-01', { counterparty_contact_id: 'vendor', nvd_number: 'N1', to_property_id: 'home' }),
      ev('calve', 'birth_marking', '2025-10-01'),
      ev('sell', 'exit', '2026-03-01', { reason: 'saleyard', counterparty_contact_id: 'yards', nvd_number: 'N2', from_property_id: 'home', nlis_transfer_status: 'to_do' }),
      ev('die', 'death', '2026-04-01'),
      ev('later', 'arrival', '2026-08-01'),
    ],
    lines: [ln('open', 'cows', 'cow', 100), ln('buy', 'steers', 'steer', 40), ln('calve', 'cows', 'calf', 80), ln('sell', 'steers', 'steer', -38), ln('die', 'cows', 'cow', -2), ln('later', 'steers', 'steer', 10)],
    locations: [],
  }
}
const classes = [{ id: 'cow', name: 'Cows' }, { id: 'steer', name: 'Steers' }, { id: 'calf', name: 'Calves' }]

describe('livestock reconciliation', () => {
  it('opening + births + purchases - sales - deaths = closing, by class, for the financial year', () => {
    const fy = financialYear('2026-02-10')
    expect(fy).toEqual({ from: '2025-07-01', to: '2026-06-30' })
    const r = reconciliation(data(), classes, fy.from, fy.to)
    expect(r).toEqual([
      { species: 'cattle', className: 'Calves', opening: 0, births: 80, purchases: 0, sales: 0, deaths: 0, other: 0, closing: 80 },
      { species: 'cattle', className: 'Cows', opening: 100, births: 0, purchases: 0, sales: 0, deaths: 2, other: 0, closing: 98 },
      { species: 'cattle', className: 'Steers', opening: 0, births: 0, purchases: 40, sales: 38, deaths: 0, other: 0, closing: 2 },
    ])
  })
})

describe('LPA movement register', () => {
  it('lists stock on and off with PICs and NVDs', () => {
    const rows = movementRegister(data(), {
      properties: [{ id: 'home', name: 'The Block', pic: 'NA123456' }],
      contacts: [{ id: 'vendor', name: 'Smith', pic: 'NB111111' }, { id: 'yards', name: 'Walcha saleyards', pic: 'NE556677' }],
      classes,
    }, '2025-07-01', '2026-06-30')
    expect(rows.map((r) => [r.direction, r.head, r.fromPic, r.toPic, r.nvd])).toEqual([
      ['On', 40, 'Smith (NB111111)', 'The Block (NA123456)', 'N1'],
      ['Off', 38, 'The Block (NA123456)', 'Walcha saleyards (NE556677)', 'N2'],
    ])
  })

  it('writes spreadsheet-safe CSV', () => {
    expect(toCsv(['a', 'b'], [['x, y', 'say "hi"']])).toBe('a,b\r\n"x, y","say ""hi"""')
  })
})

describe('starting counts', () => {
  it('a starting count during the period is opening, not other', () => {
    const s = data()
    s.events[0].event_date = '2025-10-01'
    const cows = reconciliation(s, classes, '2025-07-01', '2026-06-30').find((r) => r.className === 'Cows')!
    expect(cows).toMatchObject({ opening: 100, other: 0, deaths: 2, closing: 98 })
  })
})
