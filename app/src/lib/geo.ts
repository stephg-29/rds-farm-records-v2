// Map maths: areas, which paddock a point is in, distances. Coordinates are
// GeoJSON order [lng, lat]. Accurate enough for paddock-sized shapes.

export type LngLat = [number, number]
export type Polygon = { type: 'Polygon'; coordinates: LngLat[][] }
export type LineString = { type: 'LineString'; coordinates: LngLat[] }
export type Point = { type: 'Point'; coordinates: LngLat }
export type Geometry = Polygon | LineString | Point

const R = 6378137 // metres (WGS84)
const rad = (d: number) => (d * Math.PI) / 180

// Area of a polygon in hectares (spherical, as Turf and Leaflet measure it).
export function areaHa(p: Polygon): number {
  const ring = (coords: LngLat[]) => {
    let total = 0
    for (let i = 0; i < coords.length; i++) {
      const [x1, y1] = coords[i]
      const [x2, y2] = coords[(i + 1) % coords.length]
      total += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)))
    }
    return Math.abs((total * R * R) / 2)
  }
  const [outer, ...holes] = p.coordinates
  const m2 = ring(outer) - holes.reduce((n, h) => n + ring(h), 0)
  return Math.round((m2 / 10000) * 10) / 10
}

// Is the point inside the polygon (ray casting; holes excluded)?
export function inPolygon(pt: LngLat, p: Polygon): boolean {
  const inside = (ring: LngLat[]) => {
    let c = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c
    }
    return c
  }
  const [outer, ...holes] = p.coordinates
  return inside(outer) && !holes.some(inside)
}

// Distance between two points in metres (haversine).
export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Distance from a point to a line, in metres (flat approximation per segment,
// fine at paddock scale).
export function distanceToLineM(pt: LngLat, line: LngLat[]): number {
  if (line.length === 1) return distanceM(pt, line[0])
  const k = Math.cos(rad(pt[1]))
  const toXY = ([lng, lat]: LngLat) => [rad(lng) * R * k, rad(lat) * R]
  const [px, py] = toXY(pt)
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = toXY(line[i])
    const [bx, by] = toXY(line[i + 1])
    const dx = bx - ax
    const dy = by - ay
    const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
  }
  return best
}

export function distanceToGeometryM(pt: LngLat, g: Geometry): number {
  if (g.type === 'Point') return distanceM(pt, g.coordinates)
  if (g.type === 'LineString') return distanceToLineM(pt, g.coordinates)
  return inPolygon(pt, g) ? 0 : distanceToLineM(pt, g.coordinates[0])
}

// The centre of a polygon (average of its corners; good enough for a label).
export function centroid(p: Polygon): LngLat {
  const ring = p.coordinates[0].slice(0, -1).length > 0 ? p.coordinates[0].slice(0, -1) : p.coordinates[0]
  const n = ring.length
  return [ring.reduce((s, c) => s + c[0], 0) / n, ring.reduce((s, c) => s + c[1], 0) / n]
}

// Nearest of a set of things, within a limit.
export function nearest<T>(pt: LngLat, items: { item: T; geometry: Geometry }[], withinM = 100): { item: T; distanceM: number } | null {
  let best: { item: T; distanceM: number } | null = null
  for (const { item, geometry } of items) {
    const d = distanceToGeometryM(pt, geometry)
    if (d <= withinM && (!best || d < best.distanceM)) best = { item, distanceM: d }
  }
  return best
}

export function isPolygon(g: unknown): g is Polygon {
  return !!g && typeof g === 'object' && (g as Polygon).type === 'Polygon' && Array.isArray((g as Polygon).coordinates)
}
