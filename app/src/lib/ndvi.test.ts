import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { latestClear, ndviReadings, ndviWords, paddockNdvi, paddockNdviHistory, readRaster, type Bbox } from './ndvi'
import type { Polygon } from './geo'

// A real DEA download over The Block (30 Sep 2026): red, NIR and cloud mask.
const BBOX: Bbox = [152.578, -30.296, 152.592, -30.282]
const file = () => { const b = readFileSync(new URL('./fixtures/dea-2026-09-30.tif', import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const shedRye: Polygon = { type: 'Polygon', coordinates: [[[152.581961, -30.288477], [152.581668, -30.290019], [152.582417, -30.290073], [152.583328, -30.290888], [152.585761, -30.291427], [152.586094, -30.291253], [152.586107, -30.290397], [152.586073, -30.290179], [152.585957, -30.290036], [152.585346, -30.289804], [152.583391, -30.289361], [152.582785, -30.289185], [152.582699, -30.288907], [152.581961, -30.288477]]] }

describe('NDVI', () => {
  it('reads the bands by name and averages a paddock\'s clear pixels', async () => {
    const r = await readRaster(file(), BBOX)
    expect([r.width, r.height]).toEqual([140, 140])
    const s = paddockNdvi(r, shedRye)
    expect(s.pixels).toBeGreaterThan(40)
    expect(s.clear).toBeGreaterThan(0.95)
    expect(s.ndvi!).toBeGreaterThan(0.3)
    expect(s.ndvi!).toBeLessThan(0.95)
  })

  it('skips cloudy dates and picks the newest clear one', async () => {
    const real = await readRaster(file(), BBOX)
    const asked: string[] = []
    const getRaster = async (date: string) => {
      asked.push(date)
      return date === '2026-10-05' ? { ...real, fmask: Array.from(real.fmask, () => 2) } : real
    }
    const res = await latestClear([{ id: 'sr', property_id: 'p', boundary: shedRye }], ['2026-09-25', '2026-09-30', '2026-10-05'], { getRaster })
    expect(asked).toEqual(['2026-10-05', '2026-09-30'])
    expect(res?.date).toBe('2026-09-30')
    const adds = ndviReadings(res!, [{ id: 'sr', property_id: 'p' }], [])
    expect(adds[0].values).toMatchObject({ measure: 'ndvi_mean', source: 'satellite', paddock_id: 'sr', property_id: 'p', observed_at: '2026-09-30T00:00:00Z' })
    // Not saved twice for the same date.
    expect(ndviReadings(res!, [{ id: 'sr', property_id: 'p' }], [{ measure: 'ndvi_mean', paddock_id: 'sr', observed_at: '2026-09-30T00:00:00+00:00' }])).toEqual([])
  })

  it('history newest first, and plain words', () => {
    const h = paddockNdviHistory([{ measure: 'ndvi_mean', paddock_id: 'a', value: 0.4, observed_at: '2026-09-01' }, { measure: 'ndvi_mean', paddock_id: 'a', value: 0.6, observed_at: '2026-09-30' }, { measure: 'rainfall_mm', paddock_id: 'a', value: 5, observed_at: '2026-09-30' }], 'a')
    expect(h).toEqual([{ date: '2026-09-30', ndvi: 0.6 }, { date: '2026-09-01', ndvi: 0.4 }])
    expect(ndviWords(0.6)).toBe('good')
  })
})

