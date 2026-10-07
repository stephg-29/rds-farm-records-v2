// The made-up import files in samples/import (scripts/make-import-samples.mjs)
// all read, with their deliberately bad rows skipped.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { importFenceMap, importV1, parseCsv, parseFenceMapData, type Existing } from './importers'

const farm: Existing = {
  properties: [{ id: 'block', name: 'The Block 1', pic: null }],
  paddocks: ['Front Pdk', 'Back Pdk', 'Eastern Rye', 'Shed Rye', 'Around the Shed'].map((name, i) => ({ id: `d${i}`, property_id: 'block', name, boundary: null })),
  mobs: [{ id: 'cows', name: 'Cows' }, { id: 'weaners', name: 'Weaners' }],
  products: [], contacts: [], vehicles: [{ id: 'hilux', name: 'Hilux' }], batches: [],
}
const file = (name: string) => readFileSync(new URL(`../../../samples/import/${name}`, import.meta.url), 'utf8')

describe('sample import files', () => {
  it.each([
    ['v1 Mob Treatments.csv', 'mob', 4, 2],
    ['v1 Stock Movements.csv', 'movement', 3, 1],
    ['v1 Spray Records.csv', 'spray', 3, 0],
    ['v1 Pasture & Fertiliser.csv', 'pasture', 2, 0],
    ['v1 Vehicle Maintenance.csv', 'vehicle', 2, 1],
  ])('%s', (name, area, imported, skipped) => {
    const r = importV1(parseCsv(file(name)), farm, { owner: true })
    expect(r.area).toBe(area)
    expect(r.imported).toBe(imported)
    expect(r.skipped.length).toBe(skipped)
  })

  it('data.js fills in the five paddock boundaries and adds the fences and points', () => {
    const [fm] = parseFenceMapData(file('data.js'))
    const r = importFenceMap(fm, 'block', farm, () => 20)
    expect(r.edits.filter((e) => e.table === 'paddocks')).toHaveLength(5)
    expect(r.adds.filter((a) => a.table === 'map_features')).toHaveLength(13)
    expect(r.created).toContainEqual({ table: 'properties', id: 'block', cleared: 'start_view' })
  })
})
