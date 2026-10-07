// Elevation from the free AWS Terrain Tiles (Mapzen "terrarium" PNGs: height
// in metres = R*256 + G + B/256 - 32768). Australia-wide, about 5 m detail at
// their deepest level (15); sources include Geoscience Australia and SRTM.
// Used for the map's shaded relief and contour lines, and for heights of
// paddocks, troughs, tanks and pipe runs. Needs signal.
import type { LngLat } from './geo'
import { fetchSaved } from './tileCache'

export const TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
export const TERRAIN_MAX_ZOOM = 15
export const TERRAIN_ATTRIBUTION = 'Elevation: Terrain Tiles (AWS Open Data; Geoscience Australia, SRTM)'

export const terrariumHeight = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768

// Heights of a 256 x 256 tile, row by row.
export function decodeTile(rgba: Uint8ClampedArray, size = 256): Float32Array {
  const h = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) h[i] = terrariumHeight(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])
  return h
}

// Metres across one pixel of a tile at this zoom and latitude.
export const pixelMetres = (z: number, lat: number) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** (z + 8)

// Shaded relief (sun from the north-west, 45° up): 0 dark .. 1 lit, per pixel.
export function hillshade(h: Float32Array, size: number, cell: number, exaggerate = 2): Float32Array {
  const out = new Float32Array(size * size)
  // Esri's formula: zenith 45°, sun azimuth 315° turned into a maths angle (135°).
  const zenith = (45 * Math.PI) / 180, az = (135 * Math.PI) / 180
  const at = (x: number, y: number) => h[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dzdx = ((at(x + 1, y) - at(x - 1, y)) / (2 * cell)) * exaggerate
      const dzdy = ((at(x, y + 1) - at(x, y - 1)) / (2 * cell)) * exaggerate
      const slope = Math.atan(Math.hypot(dzdx, dzdy))
      const aspect = Math.atan2(dzdy, -dzdx)
      out[y * size + x] = Math.max(0, Math.cos(zenith) * Math.cos(slope) + Math.sin(zenith) * Math.sin(slope) * Math.cos(az - aspect))
    }
  }
  return out
}

// Contour line segments (marching squares) in pixel coordinates, every
// `interval` metres. Each segment: [x1, y1, x2, y2, height].
export function contours(h: Float32Array, size: number, interval: number): number[][] {
  const segs: number[][] = []
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const a = h[y * size + x], b = h[y * size + x + 1], c = h[(y + 1) * size + x + 1], d = h[(y + 1) * size + x]
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d)
      for (let level = Math.ceil(lo / interval) * interval; level <= hi; level += interval) {
        if (level === lo && level === hi) continue
        const pts: [number, number][] = []
        const edge = (v1: number, v2: number, x1: number, y1: number, x2: number, y2: number) => {
          if ((v1 < level) !== (v2 < level)) { const t = (level - v1) / (v2 - v1); pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]) }
        }
        edge(a, b, x, y, x + 1, y); edge(b, c, x + 1, y, x + 1, y + 1); edge(c, d, x + 1, y + 1, x, y + 1); edge(d, a, x, y + 1, x, y)
        for (let i = 0; i + 1 < pts.length; i += 2) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], level])
      }
    }
  }
  return segs
}

// Contour spacing that stays readable at each zoom.
export const contourInterval = (z: number) => (z >= 16 ? 5 : z >= 15 ? 10 : z >= 14 ? 20 : z >= 12 ? 50 : 100)

// ---- Heights at points (cached tiles) -----------------------------------------------

const tiles = new Map<string, Promise<Float32Array | null>>()

async function loadTile(z: number, x: number, y: number): Promise<Float32Array | null> {
  const key = `${z}/${x}/${y}`
  if (!tiles.has(key)) {
    tiles.set(key, (async () => {
      try {
        // The saved copy (offline map) if there is one.
        const res = await fetchSaved(TERRAIN_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)))
        if (!res.ok) return null
        const bmp = await createImageBitmap(await res.blob())
        const canvas = document.createElement('canvas')
        canvas.width = 256; canvas.height = 256
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(bmp, 0, 0)
        return decodeTile(ctx.getImageData(0, 0, 256, 256).data)
      } catch { return null }
    })())
  }
  const t = await tiles.get(key)!
  if (!t) tiles.delete(key)
  return t
}
export const tileFetcher = { load: loadTile }

// Where a point falls in the zoom-15 tile grid.
export function tilePixel([lng, lat]: LngLat, z = TERRAIN_MAX_ZOOM) {
  const n = 2 ** z
  const fx = ((lng + 180) / 360) * n
  const r = (lat * Math.PI) / 180
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  return { x: Math.floor(fx), y: Math.floor(fy), px: Math.min(255, Math.floor((fx % 1) * 256)), py: Math.min(255, Math.floor((fy % 1) * 256)) }
}

export async function heightAt(p: LngLat): Promise<number | null> {
  const t = tilePixel(p)
  const h = await tileFetcher.load(TERRAIN_MAX_ZOOM, t.x, t.y)
  return h ? Math.round(h[t.py * 256 + t.px]) : null
}

// Heights along a line (fence, pipe), sampled about every 20 m.
export async function profile(line: LngLat[]): Promise<{ start: number; end: number; low: number; high: number } | null> {
  const pts: LngLat[] = []
  for (let i = 0; i < line.length - 1; i++) {
    const [a, b] = [line[i], line[i + 1]]
    const metres = Math.hypot((b[0] - a[0]) * 96000, (b[1] - a[1]) * 111000)
    const steps = Math.max(1, Math.ceil(metres / 20))
    for (let s = 0; s < steps; s++) pts.push([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps])
  }
  pts.push(line[line.length - 1])
  const hs = (await Promise.all(pts.slice(0, 400).map(heightAt))).filter((h): h is number => h !== null)
  if (hs.length < 2) return null
  return { start: hs[0], end: hs[hs.length - 1], low: Math.min(...hs), high: Math.max(...hs) }
}

// Lowest and highest ground in a paddock (corners and a grid inside).
export async function heightRange(points: LngLat[]): Promise<{ low: number; high: number } | null> {
  const hs = (await Promise.all(points.slice(0, 200).map(heightAt))).filter((h): h is number => h !== null)
  return hs.length ? { low: Math.min(...hs), high: Math.max(...hs) } : null
}
