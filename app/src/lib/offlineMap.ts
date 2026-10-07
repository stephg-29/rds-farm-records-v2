// Saving a property's map for use with no signal. Downloads, once, the map
// tiles covering the farm (plus a margin) from sources whose licences allow
// keeping copies, credited on the map:
//  * Geoscience Australia National Base Map (CC BY 4.0), Australia-wide
//  * the latest clear Sentinel-2 satellite image from Digital Earth
//    Australia (CC BY 4.0), Australia-wide, 10 m detail
//  * NSW and Queensland government aerial imagery (Creative Commons), where
//    the farm is in those states: sharp enough for fences and troughs
//  * terrain heights (AWS Terrain Tiles, open data) for contours offline
// Tiles go in the phone's Cache Storage ("fr-offline-map"); the map uses a
// saved tile whenever there is one, signal or not. Esri imagery is never
// saved (its terms don't cover it): with no signal the map switches to these.
import { DEA_LAYER, DEA_WMS, type Bbox } from './ndvi'
import { TERRAIN_URL } from './terrain'

import { OFFLINE_CACHE } from './tileCache'
export { OFFLINE_CACHE }

// ---- Sources ---------------------------------------------------------------------------

export type OfflineSource = {
  key: string
  label: string
  attribution: string
  tileUrl: (z: number, x: number, y: number) => string
  // Zoom levels saved, and how far round the farm (km).
  zooms: [number, number]
  marginKm: number
  // Only where this source has imagery.
  bounds?: Bbox
}

const xyz = (template: string) => (z: number, x: number, y: number) =>
  template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))

// A tile's extent in Web Mercator metres, for WMS requests.
export function tileBbox3857(z: number, x: number, y: number): [number, number, number, number] {
  const size = 40075016.685578488 / 2 ** z
  const west = -20037508.342789244 + x * size
  const north = 20037508.342789244 - y * size
  return [west, north - size, west + size, north]
}

export const GA_BASE_SOURCE: OfflineSource = {
  key: 'ga', label: 'Base map (towns, roads, rivers)',
  attribution: 'Base map © Geoscience Australia (CC BY 4.0), OpenStreetMap contributors',
  tileUrl: xyz('https://services.ga.gov.au/gis/rest/services/NationalBaseMap/MapServer/tile/{z}/{y}/{x}'),
  zooms: [15, 16], marginKm: 2,
}
// Wider areas zoomed out, for finding your way to and around the farm.
export const GA_REGION_SOURCE: OfflineSource = { ...GA_BASE_SOURCE, key: 'ga-region', zooms: [5, 12], marginKm: 40 }
export const GA_NEAR_SOURCE: OfflineSource = { ...GA_BASE_SOURCE, key: 'ga-near', zooms: [13, 14], marginKm: 10 }

export const STATE_SOURCES: OfflineSource[] = [
  {
    key: 'nsw', label: 'NSW aerial imagery', attribution: 'Imagery © Spatial Services NSW (DCS), Creative Commons',
    tileUrl: xyz('https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/{z}/{y}/{x}'),
    zooms: [12, 18], marginKm: 0.3, bounds: [140.9, -37.6, 153.7, -28.1],
  },
  {
    key: 'qld', label: 'Queensland aerial imagery', attribution: 'Imagery © State of Queensland (CC BY-SA)',
    tileUrl: xyz('https://spatial-img.information.qld.gov.au/arcgis/rest/services/Basemaps/LatestStateProgram_AllUsers/ImageServer/tile/{z}/{y}/{x}'),
    zooms: [12, 18], marginKm: 0.3, bounds: [137.9, -29.2, 153.6, -9.0],
  },
]

export function sentinelSource(date: string): OfflineSource {
  return {
    key: 'sentinel', label: `Satellite image (${date})`,
    attribution: 'Satellite image © Geoscience Australia (Digital Earth Australia), CC BY 4.0; Copernicus Sentinel-2 data',
    tileUrl: (z, x, y) => `${DEA_WMS}?service=WMS&request=GetMap&version=1.3.0&layers=${DEA_LAYER}&styles=simple_rgb&format=image/png`
      + `&transparent=true&crs=EPSG:3857&width=256&height=256&time=${date}&bbox=${tileBbox3857(z, x, y).join(',')}`,
    zooms: [10, 16], marginKm: 1,
  }
}

export const TERRAIN_SOURCE: OfflineSource = {
  key: 'terrain', label: 'Heights and contours', attribution: 'Elevation: Terrain Tiles (AWS Open Data)',
  tileUrl: xyz(TERRAIN_URL), zooms: [10, 15], marginKm: 1,
}

// ---- Which tiles -------------------------------------------------------------------------

export function lngLatToTile(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z
  const r = (lat * Math.PI) / 180
  const x = Math.floor(((lng + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))]
}

export function grow([w, s, e, n]: Bbox, km: number): Bbox {
  const dLat = km / 110.54
  const dLng = km / (111.32 * Math.cos((((s + n) / 2) * Math.PI) / 180))
  return [w - dLng, s - dLat, e + dLng, n + dLat]
}

const overlaps = (a: Bbox, b: Bbox) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]

export function tilesIn(bbox: Bbox, z: number): [number, number, number][] {
  const [x1, y1] = lngLatToTile(bbox[0], bbox[3], z)
  const [x2, y2] = lngLatToTile(bbox[2], bbox[1], z)
  const out: [number, number, number][] = []
  for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) out.push([z, x, y])
  return out
}

// The sources for a farm (state imagery only if the farm is in that state).
export function sourcesFor(farm: Bbox, sentinelDate: string | null): OfflineSource[] {
  return [
    GA_REGION_SOURCE, GA_NEAR_SOURCE, GA_BASE_SOURCE,
    ...(sentinelDate ? [sentinelSource(sentinelDate)] : []),
    ...STATE_SOURCES.filter((s) => s.bounds && overlaps(farm, s.bounds)),
    TERRAIN_SOURCE,
  ]
}

export type PlannedTile = { url: string; source: string }

export function planTiles(farm: Bbox, sources: OfflineSource[]): PlannedTile[] {
  const seen = new Set<string>()
  const out: PlannedTile[] = []
  for (const s of sources) {
    const area = grow(farm, s.marginKm)
    for (let z = s.zooms[0]; z <= s.zooms[1]; z++) {
      for (const [tz, x, y] of tilesIn(area, z)) {
        const url = s.tileUrl(tz, x, y)
        if (seen.has(url)) continue
        seen.add(url)
        out.push({ url, source: s.key })
      }
    }
  }
  return out
}

// Rough size for the plan (average tile sizes seen at The Block).
const AVG_KB: Record<string, number> = { ga: 25, 'ga-region': 25, 'ga-near': 25, sentinel: 60, nsw: 30, qld: 30, terrain: 70 }
export const estimateMb = (tiles: PlannedTile[]) => Math.round(tiles.reduce((n, t) => n + (AVG_KB[t.source] ?? 30), 0) / 1024)

// ---- Saving --------------------------------------------------------------------------------

export type Progress = { done: number; total: number; failed: number; bytes: number }

export async function downloadTiles(tiles: PlannedTile[], onProgress: (p: Progress) => void, signal?: AbortSignal,
  fetcher: typeof fetch = fetch, cacheStore: CacheStorage = caches): Promise<Progress> {
  const cache = await cacheStore.open(OFFLINE_CACHE)
  const p: Progress = { done: 0, total: tiles.length, failed: 0, bytes: 0 }
  let next = 0
  const worker = async () => {
    while (next < tiles.length && !signal?.aborted) {
      const t = tiles[next++]
      try {
        if (!(await cache.match(t.url))) {
          const res = await fetcher(t.url, { signal })
          if (res.ok) {
            const blob = await res.blob()
            p.bytes += blob.size
            await cache.put(t.url, new Response(blob, { headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'image/png' } }))
          } else if (res.status !== 404) p.failed++
        }
      } catch { if (!signal?.aborted) p.failed++ }
      p.done++
      if (p.done % 10 === 0 || p.done === p.total) onProgress({ ...p })
    }
  }
  // A few at a time, to be fair to the free services.
  await Promise.all(Array.from({ length: 6 }, worker))
  return p
}

export async function removeTiles(tiles: PlannedTile[], cacheStore: CacheStorage = caches) {
  const cache = await cacheStore.open(OFFLINE_CACHE)
  await Promise.all(tiles.map((t) => cache.delete(t.url)))
}

// ---- What's saved for each property (on this phone) ------------------------------------------

export type SavedPack = { propertyId: string; farm: Bbox; sentinelDate: string | null; savedAt: string; tiles: number; failed: number; mb: number }
const packKey = (propertyId: string) => `fr-offline-${propertyId}`

export function loadPack(propertyId: string): SavedPack | null {
  try { return JSON.parse(localStorage.getItem(packKey(propertyId)) ?? 'null') as SavedPack | null } catch { return null }
}
export function savePack(p: SavedPack) {
  try { localStorage.setItem(packKey(p.propertyId), JSON.stringify(p)) } catch { /* storage unavailable */ }
}
export function forgetPack(propertyId: string) {
  try { localStorage.removeItem(packKey(propertyId)) } catch { /* storage unavailable */ }
}

