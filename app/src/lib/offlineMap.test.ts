import { describe, expect, it } from 'vitest'
import { downloadTiles, estimateMb, planTiles, sourcesFor, tileBbox3857, tilesIn, type SavedPack } from './offlineMap'
import { clearestDate, type Raster } from './ndvi'
import { backgroundLayers } from './mapStyle'

// The Block's paddocks (about 1 km by 1.4 km) and a farm near Hamilton, Victoria.
const BLOCK: [number, number, number, number] = [152.5804, -30.2958, 152.5912, -30.2826]
const VIC: [number, number, number, number] = [142.01, -37.75, 142.03, -37.73]

describe('offline map', () => {
  it('uses NSW aerial imagery for a NSW farm, and not for a Victorian one', () => {
    expect(sourcesFor(BLOCK, '2026-10-02').map((s) => s.key)).toEqual(['ga-region', 'ga-near', 'ga', 'sentinel', 'nsw', 'terrain'])
    expect(sourcesFor(VIC, '2026-10-02').map((s) => s.key)).toEqual(['ga-region', 'ga-near', 'ga', 'sentinel', 'terrain'])
  })

  it('plans a sensible download for The Block', () => {
    const tiles = planTiles(BLOCK, sourcesFor(BLOCK, '2026-10-02'))
    const by = (k: string) => tiles.filter((t) => t.source === k).length
    expect(new Set(tiles.map((t) => t.url)).size).toBe(tiles.length)
    expect(by('nsw')).toBeGreaterThan(300)
    expect(by('nsw')).toBeLessThan(1500)
    expect(tiles.length).toBeLessThan(3000)
    const mb = estimateMb(tiles)
    expect(mb).toBeGreaterThan(10)
    expect(mb).toBeLessThan(120)
  })

  it('finds the tiles covering an area and their extents', () => {
    expect(tilesIn([152.58, -30.29, 152.581, -30.289], 15)).toEqual([[15, 30272, 19279]])
    const [w, s, e, n] = tileBbox3857(0, 0, 0)
    expect(Math.round(w)).toBe(-20037508)
    expect(Math.round(e)).toBe(20037508)
    expect(Math.round(n - s)).toBe(40075017)
  })

  it('saves each tile once, skips missing ones and counts the size', async () => {
    const store = new Map<string, Response>()
    const cache = { match: async (u: string) => store.get(u), put: async (u: string, r: Response) => { store.set(u, r) }, delete: async (u: string) => store.delete(u) }
    const caches = { open: async () => cache } as unknown as CacheStorage
    const fetcher = (async (u: string) => (u.includes('missing') ? new Response('', { status: 404 }) : new Response(new Uint8Array(1000), { headers: { 'Content-Type': 'image/png' } }))) as unknown as typeof fetch
    const tiles = [{ url: 'a', source: 'ga' }, { url: 'b', source: 'ga' }, { url: 'missing', source: 'nsw' }]
    const p = await downloadTiles(tiles, () => {}, undefined, fetcher, caches)
    expect(p).toEqual({ done: 3, total: 3, failed: 0, bytes: 2000 })
    expect([...store.keys()].sort()).toEqual(['a', 'b'])
    // A second save doesn't download again.
    const again = await downloadTiles(tiles.slice(0, 2), () => {}, undefined, (async () => { throw new Error('should not fetch') }) as unknown as typeof fetch, caches)
    expect(again.bytes).toBe(0)
  })

  it('picks the newest clear satellite date for the area', async () => {
    const clear = { width: 2, height: 2, bbox: BLOCK, red: [1, 1, 1, 1], nir: [2, 2, 2, 2], fmask: [1, 1, 1, 1] } as Raster
    const cloudy = { ...clear, fmask: [2, 2, 1, 2] }
    const date = await clearestDate(BLOCK, ['2026-09-27', '2026-09-30', '2026-10-02', '2026-10-05'], { getRaster: async (d) => (d >= '2026-10-02' ? cloudy : clear) })
    expect(date).toBe('2026-09-30')
  })

  it('with no signal, the map uses only the saved sources, never Esri', () => {
    const pack: SavedPack = { propertyId: 'p', farm: BLOCK, sentinelDate: '2026-10-02', savedAt: '2026-10-08', tiles: 900, failed: 0, mb: 30 }
    const layers = backgroundLayers('imagery', { offline: true, pack })
    expect(layers.some((l) => l.url.includes('arcgis.com'))).toBe(false)
    expect(layers.length).toBe(3)
    expect(layers[1].tileUrl!(15, 30271, 19279)).toContain('time=2026-10-02')
    expect(layers[2].tileUrl!(15, 30271, 19279)).toContain('NSW_Imagery/MapServer/tile/15/19279/30271')
    // Nothing saved: the base map, which may be cached by the browser.
    expect(backgroundLayers('imagery', { offline: true, pack: null }).length).toBe(1)
  })
})
