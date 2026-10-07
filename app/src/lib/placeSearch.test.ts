import { describe, expect, it } from 'vitest'
import { parseCoords, searchPlaces } from './placeSearch'

describe('place search', () => {
  it('reads typed coordinates in either order', () => {
    expect(parseCoords('-31.25, 150.9')).toMatchObject({ lat: -31.25, lng: 150.9 })
    expect(parseCoords('150.9 -31.25')).toMatchObject({ lat: -31.25, lng: 150.9 })
    expect(parseCoords('Tamworth')).toBeNull()
  })
  it('looks up names in Australia and returns their extent', async () => {
    let asked = ''
    const fake = (async (u: string) => { asked = u; return new Response(JSON.stringify([{ display_name: 'Tamworth, New South Wales, Australia', lat: '-31.09', lon: '150.93', boundingbox: ['-31.2', '-31.0', '150.8', '151.0'] }])) }) as unknown as typeof fetch
    const r = await searchPlaces('Tamworth', fake)
    expect(asked).toContain('countrycodes=au')
    expect(r[0]).toMatchObject({ label: 'Tamworth, New South Wales', lat: -31.09, bounds: [[-31.2, 150.8], [-31.0, 151.0]] })
  })
})
