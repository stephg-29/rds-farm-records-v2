import { describe, expect, it } from 'vitest'
import { areaHa, centroid, distanceM, distanceToLineM, inPolygon, nearest, type Polygon } from './geo'

// A square near Walcha, about 1 km a side (0.009° lat ≈ 1 km; lng scaled by cos(lat)).
const lat = -31.0
const dLat = 0.009
const dLng = 0.009 / Math.cos((lat * Math.PI) / 180)
const square: Polygon = { type: 'Polygon', coordinates: [[[151, lat], [151 + dLng, lat], [151 + dLng, lat - dLat], [151, lat - dLat], [151, lat]]] }

describe('map maths', () => {
  it('works out a 1 km square as about 100 ha', () => {
    expect(areaHa(square)).toBeGreaterThan(99)
    expect(areaHa(square)).toBeLessThan(101)
  })

  it('knows whether a point is in a paddock', () => {
    expect(inPolygon([151 + dLng / 2, lat - dLat / 2], square)).toBe(true)
    expect(inPolygon([151 - 0.001, lat - dLat / 2], square)).toBe(false)
  })

  it('measures distances in metres', () => {
    expect(Math.round(distanceM([151, lat], [151, lat - dLat]))).toBeGreaterThan(995)
    expect(Math.round(distanceM([151, lat], [151, lat - dLat]))).toBeLessThan(1005)
    // 10 m off a fence line
    const off = 10 / 111320
    expect(Math.round(distanceToLineM([151 + dLng / 2, lat + off], [[151, lat], [151 + dLng, lat]]))).toBe(10)
  })

  it('finds the nearest trough within range, and nothing out of range', () => {
    const near = nearest([151, lat], [
      { item: 'Trough 3', geometry: { type: 'Point', coordinates: [151, lat + 6 / 111320] } },
      { item: 'Trough 9', geometry: { type: 'Point', coordinates: [151, lat + 60 / 111320] } },
    ])
    expect(near?.item).toBe('Trough 3')
    expect(Math.round(near!.distanceM)).toBe(6)
    expect(nearest([151, lat], [{ item: 'far', geometry: { type: 'Point', coordinates: [152, lat] } }])).toBeNull()
  })

  it('puts a label in the middle of a paddock', () => {
    const [x, y] = centroid(square)
    expect(x).toBeCloseTo(151 + dLng / 2, 6)
    expect(y).toBeCloseTo(lat - dLat / 2, 6)
  })
})
