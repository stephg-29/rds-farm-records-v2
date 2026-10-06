import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { areaHa } from './geo'
import { detectV1Area, importFenceMap, importV1, parseCsv, parseDate, parseFenceMapData, type Existing } from './importers'

const existing = (): Existing => ({
  properties: [{ id: 'home', name: 'Kooringa', pic: 'NA123456' }],
  paddocks: [{ id: 'creek', property_id: 'home', name: 'Creek paddock', boundary: null }],
  mobs: [{ id: 'weaners', name: 'Weaner steers' }],
  products: [], contacts: [], vehicles: [], batches: [],
})

const treatments = `Date,Property / PIC,Mob / paddock,Head treated,Animal type / class,Product / chemical,Dose rate,Route,Batch number,WHP (days),Meat withhold until,ESI (days),Export (ESI) until,Reason,Operator,Notes,Attachment,Synced At
2026-10-02,Kooringa (NA123456),Weaner steers,64,Weaner steers,Cydectin Pour-On,1 mL/10 kg,Pour-on / topical,4471K,42,2026-11-13,42,2026-11-13,Worms,Steph G.,,,2026-10-02 10:00
3/9/2026,Kooringa (NA123456),Yellow tag heifers,50,Heifers,"Dectomax Injectable",1 mL/50 kg,Subcutaneous injection,1223456T,28,2026-10-01,,,Worms,Sam,"Note, with comma",,
,Kooringa,,,,,,,,,,,,,,,,`

const movements = `Date,Movement,Type / class,Mob / description,No. of head,Property (from),PIC (from),Property (to),PIC (to),NVD / waybill no.,Reason,Carrier / transport,Truck rego,NLIS transfer,Notes,Attachment
2026-09-24,Stock on (arriving),Heifers,Yellow tag heifers,50,Glenvale lease,NC345678,Kooringa,NA123456,1234567,Purchase,Smith Transport,ABC123,Lodged,,
2026-10-05,Stock off (leaving),Steers,Trade steers,20,Kooringa,NA123456,Walcha saleyards,NE556677,1234590,Saleyard,Smith Transport,,To do,,`

describe('reading files', () => {
  it('reads CSV with quotes, commas and blank lines', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n\n1,2\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['1', '2']])
  })
  it('reads the dates the Sheet writes', () => {
    expect(parseDate('2026-10-02')).toBe('2026-10-02')
    expect(parseDate('3/9/2026')).toBe('2026-09-03')
    expect(parseDate('03/09/26')).toBe('2026-09-03')
    expect(parseDate('')).toBeNull()
  })
})

describe('Farm Records v1', () => {
  it('imports mob treatments: products, batches, withhold dates, and matches the mob', () => {
    const rows = parseCsv(treatments)
    expect(detectV1Area(rows[0])).toBe('mob')
    const r = importV1(rows, existing(), { owner: true })
    expect(r.imported).toBe(2)
    expect(r.skipped).toEqual([{ row: 4, why: 'No date' }])
    const ts = r.adds.filter((a) => a.table === 'treatments')
    expect(ts[0].values).toMatchObject({ treatment_date: '2026-10-02', mob_id: 'weaners', property_id: 'home', head_treated: 64, treated_by_name: 'Steph G.' })
    expect(ts[1].values).toMatchObject({ treatment_date: '2026-09-03', mob_id: null, livestock_description: 'Yellow tag heifers · Heifers' })
    expect(r.adds.filter((a) => a.table === 'products').map((a) => a.values.name)).toEqual(['Cydectin Pour-On', 'Dectomax Injectable'])
    expect(r.adds.find((a) => a.table === 'treatment_items')?.values).toMatchObject({ whp_days: 42, whp_until: '2026-11-13', reason: 'Worms' })
    expect(r.created.length).toBe(r.adds.length)
  })

  it('imports movements as records with PICs and NVDs, without changing head counts', () => {
    const r = importV1(parseCsv(movements), existing(), { owner: true })
    const evs = r.adds.filter((a) => a.table === 'stock_events')
    expect(evs.map((e) => [e.values.event_type, e.values.reason, e.values.counted_head, e.values.nvd_number, e.values.nlis_transfer_status])).toEqual([
      ['arrival', 'purchase', 50, '1234567', 'lodged'],
      ['exit', 'saleyard', 20, '1234590', 'to_do'],
    ])
    expect(r.adds.some((a) => a.table === 'stock_event_lines')).toBe(false)
    expect(r.adds.filter((a) => a.table === 'contacts').map((a) => [a.values.name, a.values.pic])).toEqual([
      ['Glenvale lease', 'NC345678'], ['Smith Transport', null], ['Walcha saleyards', 'NE556677'],
    ])
  })
})

describe('Fence Map', () => {
  it("reads the Fence Map's own data.js and imports its features and paddocks", () => {
    const text = readFileSync(new URL('../../../../fence-map-plus-reports/data.js', import.meta.url), 'utf8')
    const props = parseFenceMapData(text)
    expect(props.map((p) => p.name)).toEqual(['Example Station', 'Second Example'])
    const r = importFenceMap(props[0], 'home', { ...existing(), paddocks: [{ id: 'creek', property_id: 'home', name: 'Creek paddock', boundary: null }] }, (c) => areaHa({ type: 'Polygon', coordinates: c }))
    const types = r.adds.filter((a) => a.table === 'map_features').map((a) => a.values.feature_type)
    expect(types.filter((t) => t === 'electric_unit')).toHaveLength(2)
    expect(types.filter((t) => t === 'electric_fence')).toHaveLength(3)
    expect(types).toEqual(expect.arrayContaining(['pipe', 'trough', 'gate', 'yard', 'tank']))
    // Creek paddock already existed without a boundary: it gets one (undo can clear it).
    expect(r.edits.find((e) => e.id === 'creek')?.changes.boundary).toBeTruthy()
    expect(r.created).toContainEqual({ table: 'paddocks', id: 'creek', cleared: 'boundary' })
    // GeoJSON order is [lng, lat].
    const trough = r.adds.find((a) => a.values.name === 'East trough')!
    expect((trough.values.geometry as { coordinates: number[] }).coordinates).toEqual([151.5052, -30.5006])
    expect(r.edits.find((e) => e.table === 'properties')?.changes).toMatchObject({ centre_lat: -30.5, centre_lng: 151.5, default_zoom: 15 })
  })
})
