// Finding a place on the map: typed coordinates ("-31.25, 150.9"), or a
// town, road or address in Australia. With the farm's esriApiKey the lookup
// is Esri's geocoder (free tier, results not stored); without one it is
// OpenStreetMap's Nominatim (free; one search per tap, never as-you-type, per
// its usage policy). Needs signal.
export type Place = { label: string; lat: number; lng: number; bounds?: [[number, number], [number, number]] }

export function parseCoords(q: string): Place | null {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  let a = Number(m[1]), b = Number(m[2])
  // Accept either order; Australia is south (negative) and east (110 to 155).
  if (Math.abs(a) > 90 && Math.abs(b) <= 90) [a, b] = [b, a]
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null
  return { label: `${a}, ${b}`, lat: a, lng: b }
}

type NominatimHit = { display_name: string; lat: string; lon: string; boundingbox?: [string, string, string, string] }
type EsriCandidate = { address: string; location: { x: number; y: number }; extent?: { xmin: number; ymin: number; xmax: number; ymax: number } }

export async function searchPlaces(q: string, opts: { esriKey?: string | null; fetcher?: typeof fetch } = {}): Promise<Place[]> {
  const fetcher = opts.fetcher ?? fetch
  const coords = parseCoords(q)
  if (coords) return [coords]
  if (q.trim().length < 3) return []
  if (opts.esriKey) {
    const url = 'https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'
      + `?f=json&countryCode=AUS&maxLocations=6&singleLine=${encodeURIComponent(q.trim())}&token=${encodeURIComponent(opts.esriKey)}`
    const res = await fetcher(url)
    const body = res.ok ? ((await res.json()) as { candidates?: EsriCandidate[]; error?: unknown }) : null
    if (!body || body.error) throw new Error('Search is not available right now.')
    return (body.candidates ?? []).map((c) => ({
      label: c.address.replace(/, (AUS|Australia)$/, ''),
      lat: c.location.y, lng: c.location.x,
      bounds: c.extent ? [[c.extent.ymin, c.extent.xmin], [c.extent.ymax, c.extent.xmax]] : undefined,
    }))
  }
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=au&limit=6&q=${encodeURIComponent(q.trim())}`
  const res = await fetcher(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Search is not available right now.')
  const hits = (await res.json()) as NominatimHit[]
  return hits.map((h) => ({
    label: h.display_name.replace(/, Australia$/, ''),
    lat: Number(h.lat), lng: Number(h.lon),
    bounds: h.boundingbox ? [[Number(h.boundingbox[0]), Number(h.boundingbox[2])], [Number(h.boundingbox[1]), Number(h.boundingbox[3])]] : undefined,
  }))
}
