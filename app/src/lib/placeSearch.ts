// Finding a place on the map: typed coordinates ("-31.25, 150.9"), or a
// town, road or address in Australia looked up with OpenStreetMap's
// Nominatim (free; one search per tap, never as-you-type, per its usage
// policy). Needs signal.
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

export async function searchPlaces(q: string, fetcher: typeof fetch = fetch): Promise<Place[]> {
  const coords = parseCoords(q)
  if (coords) return [coords]
  if (q.trim().length < 3) return []
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
