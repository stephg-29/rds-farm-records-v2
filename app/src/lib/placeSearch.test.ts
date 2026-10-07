import { describe, expect, it } from 'vitest'
import { parseCoords, searchPlaces } from './placeSearch'

const fakeFetch = (body: unknown, seen: { url: string }) =>
  (async (u: string) => { seen.url = u; return new Response(JSON.stringify(body)) }) as unknown as typeof fetch

describe('place search', () => {
  it('reads typed coordinates in either order', () => {
    expect(parseCoords('-31.25, 150.9')).toMatchObject({ lat: -31.25, lng: 150.9 })
    expect(parseCoords('150.9 -31.25')).toMatchObject({ lat: -31.25, lng: 150.9 })
    expect(parseCoords('Tamworth')).toBeNull()
  })

  it('without a key, looks up names in Australia with OpenStreetMap', async () => {
    const seen = { url: '' }
    const r = await searchPlaces('Tamworth', { fetcher: fakeFetch([{ display_name: 'Tamworth, New South Wales, Australia', lat: '-31.09', lon: '150.93', boundingbox: ['-31.2', '-31.0', '150.8', '151.0'] }], seen) })
    expect(seen.url).toContain('nominatim.openstreetmap.org')
    expect(seen.url).toContain('countrycodes=au')
    expect(r[0]).toMatchObject({ label: 'Tamworth, New South Wales', lat: -31.09, bounds: [[-31.2, 150.8], [-31.0, 151.0]] })
  })

  it("with the farm's Esri key, uses Esri's geocoder in Australia", async () => {
    const seen = { url: '' }
    const r = await searchPlaces('Wagga Wagga', {
      esriKey: 'KEY',
      fetcher: fakeFetch({ candidates: [{ address: 'Wagga Wagga, New South Wales, AUS', location: { x: 147.37, y: -35.11 }, extent: { xmin: 147.3, ymin: -35.2, xmax: 147.4, ymax: -35.0 } }] }, seen),
    })
    expect(seen.url).toContain('geocode-api.arcgis.com')
    expect(seen.url).toContain('countryCode=AUS')
    expect(seen.url).toContain('token=KEY')
    expect(r[0]).toMatchObject({ label: 'Wagga Wagga, New South Wales', lat: -35.11, lng: 147.37, bounds: [[-35.2, 147.3], [-35.0, 147.4]] })
  })

  it('a refused key reads as search not available', async () => {
    await expect(searchPlaces('Dubbo', { esriKey: 'BAD', fetcher: fakeFetch({ error: { code: 498 } }, { url: '' }) })).rejects.toThrow('not available')
  })
})
