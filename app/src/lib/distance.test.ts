import { describe, expect, it } from 'vitest'
import { fmtDistance, lengthM, perimeterM } from './geo'

describe('distances', () => {
  it('measures along a line and around a paddock', () => {
    // 0.001° of latitude is about 111 m.
    expect(lengthM([[150, -30], [150, -30.001], [150, -30.002]])).toBeCloseTo(222.4, 0)
    // A square about 96 m by 111 m at 30°S, given open or closed.
    const open = { type: 'Polygon' as const, coordinates: [[[150, -30], [150.001, -30], [150.001, -30.001], [150, -30.001]] as [number, number][]] }
    const closed = { ...open, coordinates: [[...open.coordinates[0], [150, -30] as [number, number]]] }
    expect(perimeterM(open)).toBeCloseTo(perimeterM(closed))
    expect(perimeterM(open)).toBeGreaterThan(410)
    expect(perimeterM(open)).toBeLessThan(420)
  })
  it('reads naturally', () => {
    expect(fmtDistance(842.4)).toBe('842 m')
    expect(fmtDistance(1240)).toBe('1.24 km')
    expect(fmtDistance(12600)).toBe('12.6 km')
  })
})
