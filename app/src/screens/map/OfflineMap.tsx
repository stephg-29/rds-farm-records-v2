// "Save this property for offline": downloads the farm's map once so it works
// with no signal (see lib/offlineMap.ts for the sources and their licences).
import { useRef, useState } from 'react'
import type { Row } from '../../lib/db'
import { isPolygon } from '../../lib/geo'
import { clearestDate, imageryDates, paddocksBbox, type Bbox } from '../../lib/ndvi'
import {
  downloadTiles, estimateMb, forgetPack, grow, loadPack, planTiles, removeTiles, savePack, sourcesFor, type Progress,
} from '../../lib/offlineMap'
import { Button, Notice, nowIso } from '../../ui'
import { fmtDate } from '../stockParts'

// The farm's area: its mapped paddocks, else 1.5 km round its start view.
export function farmArea(property: Row, paddocks: Row[]): Bbox | null {
  const mine = paddocks.filter((d) => d.property_id === property.id && !d.archived_at && isPolygon(d.boundary))
  const fromPaddocks = paddocksBbox(mine)
  if (fromPaddocks) return fromPaddocks
  if (property.centre_lat && property.centre_lng) {
    const lng = Number(property.centre_lng), lat = Number(property.centre_lat)
    return grow([lng, lat, lng, lat], 1.5)
  }
  return null
}

export function OfflineMapCard({ property, paddocks, offline, onChanged }: { property: Row; paddocks: Row[]; offline: boolean; onChanged: () => void }) {
  const [pack, setPack] = useState(() => loadPack(String(property.id)))
  const [busy, setBusy] = useState<'finding' | 'saving' | 'removing' | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const farm = farmArea(property, paddocks)
  const estimate = farm ? estimateMb(planTiles(farm, sourcesFor(farm, 'estimate'))) : 0
  const sources = farm ? sourcesFor(farm, null) : []
  const stateImagery = sources.filter((s) => s.key === 'nsw' || s.key === 'qld').map((s) => s.label)

  async function save() {
    if (!farm) return
    setProblem(null)
    // Ask the phone to keep the saved map even when storage gets tight.
    try { await navigator.storage?.persist?.() } catch { /* not supported */ }
    abort.current = new AbortController()
    try {
      setBusy('finding')
      const centre: [number, number] = [(farm[0] + farm[2]) / 2, (farm[1] + farm[3]) / 2]
      let sentinelDate: string | null = null
      try { sentinelDate = await clearestDate(grow(farm, 1), await imageryDates(centre)) } catch { sentinelDate = null }
      // Replace an older save (e.g. an older satellite image).
      if (pack) await removeTiles(planTiles(pack.farm, sourcesFor(pack.farm, pack.sentinelDate)))
      setBusy('saving')
      const tiles = planTiles(farm, sourcesFor(farm, sentinelDate))
      setProgress({ done: 0, total: tiles.length, failed: 0, bytes: 0 })
      const p = await downloadTiles(tiles, setProgress, abort.current.signal)
      if (abort.current.signal.aborted) { setProblem('Stopped. Save again to finish.'); return }
      const saved = { propertyId: String(property.id), farm, sentinelDate, savedAt: nowIso(), tiles: p.total - p.failed, failed: p.failed, mb: Math.round(p.bytes / 1048576) }
      savePack(saved)
      setPack(saved)
      onChanged()
      if (p.failed > 0) setProblem(`${p.failed} map pieces didn't download (weak signal?). Save again to fill them in.`)
    } catch {
      setProblem('Saving needs signal. Try again on wifi or better coverage.')
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  async function remove() {
    if (!pack) return
    setBusy('removing')
    await removeTiles(planTiles(pack.farm, sourcesFor(pack.farm, pack.sentinelDate)))
    forgetPack(String(property.id))
    setPack(null)
    setBusy(null)
    onChanged()
  }

  return (
    <div className="mb-3 rounded-2xl border border-line bg-paper p-3">
      <div className="font-semibold">Offline map for {String(property.name)}</div>
      {!farm && <p className="mt-1 text-sm text-muted">Set the start view (✎, Set start view) or map a paddock first, so the app knows the farm's area.</p>}
      {farm && pack && !busy && (
        <p className="mt-1 text-sm">
          Saved {fmtDate(pack.savedAt.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })} · {pack.mb} MB.
          <span className="text-muted"> Works with no signal: {[...stateImagery, pack.sentinelDate ? `satellite image (${fmtDate(pack.sentinelDate)})` : null, 'base map', 'heights and contours'].filter(Boolean).join(', ')}.</span>
        </p>
      )}
      {farm && !pack && !busy && (
        <p className="mt-1 text-sm text-muted">
          Download this farm's map once (about {Math.max(5, estimate)} MB, best on wifi) so it works with no signal: {[...stateImagery, 'the latest clear satellite image', 'base map', 'heights and contours'].join(', ')}.
          {stateImagery.length === 0 && ' Aerial photos offline are available for NSW and Queensland farms; elsewhere the satellite image (10 m) is used.'}
        </p>
      )}
      {busy === 'finding' && <p className="mt-1 text-sm">Finding the latest clear satellite image…</p>}
      {busy === 'saving' && progress && (
        <div className="mt-2">
          <div className="h-2 overflow-hidden rounded-full bg-card"><div className="h-full rounded-full bg-green" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} /></div>
          <p className="mt-1 text-xs text-muted">{progress.done.toLocaleString('en-AU')} of {progress.total.toLocaleString('en-AU')} map pieces · {Math.round(progress.bytes / 1048576)} MB</p>
        </div>
      )}
      {busy === 'removing' && <p className="mt-1 text-sm">Removing…</p>}
      {problem && <div className="mt-2"><Notice tone="warn">{problem}</Notice></div>}
      {farm && (
        <div className="mt-2 flex flex-wrap gap-2">
          {busy === 'saving' || busy === 'finding'
            ? <Button kind="secondary" onClick={() => abort.current?.abort()}>Stop</Button>
            : <Button kind={pack ? 'secondary' : 'primary'} disabled={offline || !!busy} onClick={save}>{pack ? 'Update' : 'Save for offline'}</Button>}
          {pack && !busy && <Button kind="quiet" onClick={remove}>Remove</Button>}
        </div>
      )}
      {offline && !busy && <p className="mt-1 text-xs text-muted">No signal now: saving needs signal.</p>}
    </div>
  )
}
