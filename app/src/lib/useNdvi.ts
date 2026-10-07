// When the NDVI layer is on: find the property's latest clear satellite pass,
// show it, and save each paddock's average NDVI for that date (once).
// Checked at most every 6 hours per property on a phone.
import { useEffect, useRef, useState } from 'react'
import type { Row } from './db'
import { centroid, isPolygon } from './geo'
import { imageryDates, latestClear, ndviReadings, paddocksBbox } from './ndvi'
import { useSync, useTable } from './useSync'

export type NdviState = { status: 'idle' | 'loading' | 'ready' | 'none' | 'error'; date?: string; clear?: number }
const FRESH_MS = 6 * 3600 * 1000
type Cached = { date: string; clear: number; at: number }

function readCache(key: string): Cached | null {
  try {
    const c = JSON.parse(localStorage.getItem(key) ?? 'null') as Cached | null
    return c && Date.now() - c.at < FRESH_MS ? c : null
  } catch { return null }
}

export function useNdvi(property: Row | undefined, paddocks: Row[], enabled: boolean): NdviState {
  const { saveAll } = useSync()
  const readings = useTable('readings')
  // The answer found for a property (keyed, so a different property starts fresh).
  const [found, setFound] = useState<{ key: string; state: NdviState } | null>(null)
  const latest = useRef({ paddocks, readings, saveAll })
  useEffect(() => { latest.current = { paddocks, readings, saveAll } })
  const mapped = paddocks.filter((d) => d.property_id === property?.id && isPolygon(d.boundary)).length
  const key = property ? `fr-ndvi-${property.id}` : ''
  const cached = key ? readCache(key) : null
  const needed = enabled && !!property && mapped > 0 && !cached && found?.key !== key

  useEffect(() => {
    if (!needed || !property) return
    let live = true
    ;(async () => {
      const mine = latest.current.paddocks.filter((d) => d.property_id === property.id && isPolygon(d.boundary))
      const bbox = paddocksBbox(mine)!
      const centre: [number, number] = property.centre_lat ? [Number(property.centre_lng), Number(property.centre_lat)]
        : isPolygon(mine[0].boundary) ? centroid(mine[0].boundary) : [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
      const res = await latestClear(mine, await imageryDates(centre))
      if (!live) return
      if (!res) return setFound({ key, state: { status: 'none' } })
      const adds = ndviReadings(res, mine, latest.current.readings ?? [])
      if (adds.length) await latest.current.saveAll(adds)
      try { localStorage.setItem(key, JSON.stringify({ date: res.date, clear: res.clear, at: Date.now() })) } catch { /* storage unavailable */ }
      setFound({ key, state: { status: 'ready', date: res.date, clear: res.clear } })
    })().catch(() => { if (live) setFound({ key, state: { status: 'error' } }) })
    return () => { live = false }
  }, [needed, property, key])

  if (!enabled) return { status: 'idle' }
  if (mapped === 0) return { status: 'idle' }
  if (cached) return { status: 'ready', date: cached.date, clear: cached.clear }
  return found?.key === key ? found.state : { status: 'loading' }
}
