import { describe, expect, it } from 'vitest'
import { contourInterval, contours, decodeTile, hillshade, terrariumHeight, tilePixel } from './terrain'

describe('terrain', () => {
  it('decodes terrarium heights', () => {
    // 812 m: 812 + 32768 = 33580 = 131*256 + 44
    expect(terrariumHeight(131, 44, 0)).toBe(812)
    const rgba = new Uint8ClampedArray([131, 44, 128, 255])
    expect(decodeTile(rgba, 1)[0]).toBeCloseTo(812.5)
  })

  it('draws contour lines across a slope at each interval', () => {
    // A 10 x 10 slope rising 10 m per pixel to the east: lines at 20, 40, 60, 80.
    const size = 10
    const h = new Float32Array(size * size).map((_, i) => (i % size) * 10)
    const segs = contours(h, size, 20)
    expect([...new Set(segs.map((s) => s[4]))].sort((a, b) => a - b)).toEqual([20, 40, 60, 80])
    // Vertical lines: x is constant along each.
    for (const s of segs) expect(s[0]).toBeCloseTo(s[2])
  })

  it('shades slopes facing away from the sun darker', () => {
    const size = 5
    const east = new Float32Array(size * size).map((_, i) => (i % size) * 10) // rises to the east: faces west
    const west = new Float32Array(size * size).map((_, i) => (size - (i % size)) * 10) // faces east
    expect(hillshade(east, size, 10)[12]).toBeGreaterThan(hillshade(west, size, 10)[12])
  })

  it('finds the tile and pixel for a point, and picks readable contour spacing', () => {
    const t = tilePixel([152.5866, -30.2884])
    expect([t.x, t.y]).toEqual([30272, 19279])
    expect(contourInterval(16)).toBe(5)
    expect(contourInterval(13)).toBe(50)
  })
})
