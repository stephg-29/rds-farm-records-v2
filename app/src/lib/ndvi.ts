// NDVI (pasture growth) from Digital Earth Australia's Sentinel-2 imagery
// (free, CC BY 4.0; 10 m pixels, a pass about every 5 days, when not cloudy).
// The map shows DEA's NDVI picture for a chosen date; each paddock's average
// NDVI (cloud-free pixels only) is saved as a reading, so the paddock's
// history works offline and sits beside its grazing and rest days.
import type { Row } from './db'
import { inPolygon, isPolygon, type LngLat, type Polygon } from './geo'
import type { NewRecord } from './sync'

export const DEA_WMS = 'https://ows.dea.ga.gov.au/'
export const DEA_WCS = 'https://ows.dea.ga.gov.au/wcs'
export const DEA_LAYER = 'ga_s2m_ard_3'
export const NDVI_ATTRIBUTION = 'NDVI © Geoscience Australia (Digital Earth Australia), CC BY 4.0; contains Copernicus Sentinel-2 data'
export const NDVI_SOURCE = 'dea:ga_s2m_ard_3'

export type Bbox = [number, number, number, number] // west, south, east, north
export type Raster = { width: number; height: number; bbox: Bbox; red: ArrayLike<number>; nir: ArrayLike<number>; fmask: ArrayLike<number> }

// Dates DEA has imagery for at a point (newest last).
export async function imageryDates([lng, lat]: LngLat, fetcher: typeof fetch = fetch): Promise<string[]> {
  const d = 0.001
  const url = `${DEA_WMS}?service=WMS&version=1.3.0&request=GetFeatureInfo&layers=${DEA_LAYER}&query_layers=${DEA_LAYER}&styles=ndvi`
    + `&crs=EPSG:4326&bbox=${lat - d},${lng - d},${lat + d},${lng + d}&width=11&height=11&i=5&j=5&info_format=application/json`
  const res = await fetcher(url)
  if (!res.ok) throw new Error('Satellite imagery is not available right now.')
  const j = (await res.json()) as { features?: { properties?: { data_available_for_dates?: string[] } }[] }
  return j.features?.[0]?.properties?.data_available_for_dates ?? []
}

// Red, near-infrared and the cloud mask for an area on one date, at ~10 m.
export async function fetchRaster(date: string, bbox: Bbox, fetcher: typeof fetch = fetch): Promise<Raster> {
  const [w, s, e, n] = bbox
  const midLat = (s + n) / 2
  const width = Math.min(600, Math.max(8, Math.round(((e - w) * 111320 * Math.cos((midLat * Math.PI) / 180)) / 10)))
  const height = Math.min(600, Math.max(8, Math.round(((n - s) * 110540) / 10)))
  const url = `${DEA_WCS}?service=WCS&version=1.0.0&request=GetCoverage&coverage=${DEA_LAYER}&time=${date}`
    + `&bbox=${w},${s},${e},${n}&crs=EPSG:4326&response_crs=EPSG:4326&width=${width}&height=${height}&format=GeoTIFF`
    + '&measurements=nbart_red,nbart_nir_1,oa_fmask'
  const res = await fetcher(url)
  if (!res.ok) throw new Error('Satellite imagery is not available right now.')
  return readRaster(await res.arrayBuffer(), bbox)
}

export async function readRaster(buf: ArrayBuffer, bbox: Bbox): Promise<Raster> {
  const { fromArrayBuffer } = await import('geotiff')
  const img = await (await fromArrayBuffer(buf)).getImage()
  const bands = (await img.readRasters()) as unknown as ArrayLike<number>[]
  // The bands come back in the service's own order: find them by name.
  const names = [0, 1, 2].map((b) => String((img.getGDALMetadata(b) as Record<string, string> | null)?.DESCRIPTION ?? ''))
  const band = (n: string, fallback: number) => bands[names.indexOf(n) >= 0 ? names.indexOf(n) : fallback]
  return { width: img.getWidth(), height: img.getHeight(), bbox, red: band('nbart_red', 0), nir: band('nbart_nir_1', 1), fmask: band('oa_fmask', 2) }
}

// Average NDVI of the cloud-free pixels inside a paddock, and how much of it
// was clear (Fmask 1 = clear land; 2 cloud, 3 shadow, 4 snow, 5 water).
export function paddockNdvi(r: Raster, boundary: Polygon): { ndvi: number | null; clear: number; pixels: number } {
  const [w, s, e, n] = r.bbox
  let sum = 0, clear = 0, pixels = 0
  for (let y = 0; y < r.height; y++) {
    const lat = n - ((y + 0.5) / r.height) * (n - s)
    for (let x = 0; x < r.width; x++) {
      const lng = w + ((x + 0.5) / r.width) * (e - w)
      if (!inPolygon([lng, lat], boundary)) continue
      pixels++
      const i = y * r.width + x
      const red = Number(r.red[i]), nir = Number(r.nir[i])
      if (Number(r.fmask[i]) !== 1 || red < 0 || nir < 0 || red + nir === 0) continue
      sum += (nir - red) / (nir + red)
      clear++
    }
  }
  return { ndvi: clear ? Math.round((sum / clear) * 1000) / 1000 : null, clear: pixels ? clear / pixels : 0, pixels }
}

export function paddocksBbox(paddocks: Row[]): Bbox | null {
  const pts = paddocks.filter((d) => isPolygon(d.boundary)).flatMap((d) => (d.boundary as Polygon).coordinates[0])
  if (pts.length === 0) return null
  const pad = 0.001
  return [Math.min(...pts.map((p) => p[0])) - pad, Math.min(...pts.map((p) => p[1])) - pad, Math.max(...pts.map((p) => p[0])) + pad, Math.max(...pts.map((p) => p[1])) + pad]
}

export type NdviResult = { date: string; clear: number; paddocks: { id: string; ndvi: number | null; clear: number }[] }

// The newest date (of the last few) where most of the property's paddocks
// were clear of cloud, with each paddock's NDVI.
export async function latestClear(paddocks: Row[], dates: string[], opts: { tries?: number; minClear?: number; getRaster?: (date: string, bbox: Bbox) => Promise<Raster> } = {}): Promise<NdviResult | null> {
  const mapped = paddocks.filter((d) => isPolygon(d.boundary))
  const bbox = paddocksBbox(mapped)
  if (!bbox) return null
  for (const date of [...dates].reverse().slice(0, opts.tries ?? 6)) {
    const r = await (opts.getRaster ?? fetchRaster)(date, bbox)
    const stats = mapped.map((d) => ({ id: String(d.id), ...paddockNdvi(r, d.boundary as Polygon) }))
    const px = stats.reduce((n, x) => n + x.pixels, 0)
    const clear = px ? stats.reduce((n, x) => n + x.clear * x.pixels, 0) / px : 0
    if (clear >= (opts.minClear ?? 0.8)) return { date, clear, paddocks: stats.map(({ id, ndvi, clear: c }) => ({ id, ndvi, clear: c })) }
  }
  return null
}

// Readings to save for a result, skipping paddocks already read for that date.
export function ndviReadings(result: NdviResult, paddocks: Row[], existing: Row[]): NewRecord[] {
  const have = new Set(existing.filter((r) => r.measure === 'ndvi_mean').map((r) => `${r.paddock_id}|${String(r.observed_at).slice(0, 10)}`))
  return result.paddocks
    .filter((p) => p.ndvi !== null && p.clear >= 0.5 && !have.has(`${p.id}|${result.date}`))
    .map((p) => ({ table: 'readings', values: {
      source: 'satellite', measure: 'ndvi_mean', value: p.ndvi, observed_at: `${result.date}T00:00:00Z`,
      paddock_id: p.id, property_id: paddocks.find((d) => d.id === p.id)?.property_id ?? null, external_ref: `${NDVI_SOURCE}:${result.date}`,
    } }))
}

// A paddock's NDVI readings, newest first.
export function paddockNdviHistory(readings: Row[], paddockId: string): { date: string; ndvi: number }[] {
  return readings.filter((r) => r.measure === 'ndvi_mean' && r.paddock_id === paddockId && !r.deleted_at)
    .map((r) => ({ date: String(r.observed_at).slice(0, 10), ndvi: Number(r.value) }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

// Plain words for an NDVI value (pasture, roughly).
export function ndviWords(v: number): string {
  return v < 0.2 ? 'bare or very little green' : v < 0.35 ? 'sparse' : v < 0.5 ? 'moderate' : v < 0.65 ? 'good' : 'very green and dense'
}

// The newest of the last few dates where an area was mostly clear of cloud
// (for the offline satellite image, before any paddocks are mapped).
export async function clearestDate(bbox: Bbox, dates: string[], opts: { tries?: number; minClear?: number; getRaster?: (date: string, bbox: Bbox) => Promise<Raster> } = {}): Promise<string | null> {
  for (const date of [...dates].reverse().slice(0, opts.tries ?? 8)) {
    const r = await (opts.getRaster ?? fetchRaster)(date, bbox)
    let clear = 0, n = 0
    for (let i = 0; i < r.width * r.height; i++) { const f = Number(r.fmask[i]); if (f === 0 || f === -999) continue; n++; if (f === 1 || f === 5) clear++ }
    if (n && clear / n >= (opts.minClear ?? 0.9)) return date
  }
  return null
}
