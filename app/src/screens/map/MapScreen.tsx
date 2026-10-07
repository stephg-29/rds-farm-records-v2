// The farm map: one property at a time, with layers, GPS, tap-to-see, tap a
// mob then a paddock to move it, and drawing paddocks, fences and points.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import type { Row } from '../../lib/db'
import { areaHa, isPolygon, type Geometry } from '../../lib/geo'
import { FEATURE_TYPES, LATER_LAYERS, LAYERS, esriKey, loadBackground, loadLayers, saveBackground, saveLayers, type Background, type FeatureType, type LayerId } from '../../lib/mapStyle'
import { searchPlaces, type Place } from '../../lib/placeSearch'
import { paddockRest, todayLocal, mobHeads } from '../../lib/stock'
import { useHealth } from '../../lib/useHealth'
import { useGps } from '../../lib/useGps'
import { useStock } from '../../lib/useStock'
import { useSync, useTable } from '../../lib/useSync'
import { useSprayWithholds } from '../../lib/useLand'
import { Button, Field, Notice, Toggle, go, inputClass, nowIso } from '../../ui'
import { fmtDate } from '../stockParts'
import { MapView, type MapMob } from './MapView'

const LS_PROP = 'fr-map-property'
type Selection =
  | { kind: 'paddock'; row: Row }
  | { kind: 'mob'; mob: MapMob }
  | { kind: 'feature'; row: Row }
  | { kind: 'issue'; row: Row }
  | { kind: 'new-shape'; geometry: Geometry }
  | null

export function MapScreen() {
  const stock = useStock()
  const health = useHealth(stock.mobName)
  const features = (useTable('map_features') ?? []).filter((f) => !f.archived_at)
  const issues = useTable('issues') ?? []
  const allPaddocks = useTable('paddocks') ?? []
  const sprayUntil = useSprayWithholds()
  const [propertyId, setPropertyId] = useState<string | null>(() => { try { return localStorage.getItem(LS_PROP) } catch { return null } })
  const property = stock.properties.find((p) => p.id === propertyId) ?? stock.properties[0]
  const [layers, setLayers] = useState(loadLayers)
  const [panel, setPanel] = useState<'layers' | 'property' | 'search' | null>(null)
  const [background, setBg] = useState<Background>(loadBackground)
  const [sel, setSel] = useState<Selection>(null)
  const [movingMob, setMovingMob] = useState<MapMob | null>(null)
  const [editing, setEditing] = useState(false)
  // A boundary or line being reshaped: taps on anything else are ignored
  // until it is saved or cancelled (otherwise it could be saved onto the
  // paddock tapped next).
  const [reshaping, setReshaping] = useState<string | null>(null)
  // Drawing something new: what, so the bar can say how to finish it.
  const [drawing, setDrawing] = useState<'Polygon' | 'Line' | 'CircleMarker' | null>(null)
  // Bumped by the location button: the map centres on the next fix.
  const [centreOn, setCentreOn] = useState(0)
  const gps = useGps(layers.location)
  const [leaflet, setLeaflet] = useState<L.Map | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { edit } = useSync()

  const mobs: MapMob[] = useMemo(() => stock.mobs.map((m) => ({
    id: m.id, name: m.name, head: m.head, propertyId: m.location?.propertyId ?? '', paddockId: m.location?.paddockId ?? null,
    underWithhold: health.active.has(m.id),
  })), [stock.mobs, health.active])

  function setLayer(id: LayerId, on: boolean) {
    const next = { ...layers, [id]: on }
    setLayers(next)
    saveLayers(next)
  }

  function chooseProperty(id: string) {
    setPropertyId(id)
    try { localStorage.setItem(LS_PROP, id) } catch { /* storage unavailable */ }
    setPanel(null)
    setSel(null)
  }

  // Drawing (edit mode): Leaflet-Geoman, shapes saved as GeoJSON.
  useEffect(() => {
    const m = leaflet
    if (!m) return
    const onCreate = (e: { layer: L.Layer }) => {
      const geometry = (e.layer as L.Polygon).toGeoJSON().geometry as Geometry
      m.removeLayer(e.layer)
      setDrawing(null)
      setSel({ kind: 'new-shape', geometry })
    }
    // Drawing can also end without a shape (e.g. undoing the only point).
    const onEnd = () => setDrawing(null)
    m.on('pm:create', onCreate as never)
    m.on('pm:drawend', onEnd)
    return () => { m.off('pm:create', onCreate as never); m.off('pm:drawend', onEnd) }
  }, [editing, leaflet])

  function draw(shape: 'Polygon' | 'Line' | 'CircleMarker') {
    const m = leaflet
    if (!m) return
    setSel(null)
    m.pm.enableDraw(shape, { snappable: true, snapDistance: 15, continueDrawing: false, templineStyle: { color: '#feffb9' }, hintlineStyle: { color: '#feffb9', dashArray: '5 5' }, pathOptions: { color: '#feffb9' } } as never)
    setDrawing(shape)
  }
  // Geoman's own finish (tap the last point again) is fiddly on a phone.
  type DrawTool = { _finishShape?: () => void; _removeLastVertex?: () => void; _layer?: L.Polyline }
  const tool = () => (drawing && leaflet ? (leaflet.pm.Draw as unknown as Record<string, DrawTool>)[drawing === 'Polygon' ? 'Polygon' : 'Line'] : undefined)
  const points = () => (tool()?._layer?.getLatLngs() as unknown[] | undefined)?.length ?? 0
  function finishDrawing() {
    const t = tool()
    if (!t?._finishShape) return
    if (points() < (drawing === 'Polygon' ? 3 : 2)) return setNotice(drawing === 'Polygon' ? 'Tap at least 3 corners first.' : 'Tap at least 2 points first.')
    t._finishShape()
  }
  function cancelDrawing() {
    leaflet?.pm.disableDraw()
    setDrawing(null)
  }

  const onPaddock = (row: Row) => {
    if (movingMob) {
      go(`/stock/${movingMob.id}/move?to=${row.id}`)
      setMovingMob(null)
      return
    }
    setSel({ kind: 'paddock', row })
  }

  if (!stock.ready) return null
  if (!property) {
    return (
      <div className="mx-auto max-w-md px-5 pt-8">
        <h1 className="text-3xl text-green-deep">Map</h1>
        <p className="mt-3 text-muted">Add a property in More, Properties and paddocks first.</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-x-0 top-0 bottom-[calc(4rem+env(safe-area-inset-bottom))]">
      <MapView
        property={property} paddocks={allPaddocks} features={features} issues={issues} mobs={mobs} sprayUntil={sprayUntil}
        layers={layers} background={background} gps={gps.fix} centreOn={centreOn} interactive={!drawing && !reshaping}
        selectedId={sel?.kind === 'paddock' || sel?.kind === 'feature' ? String(sel.row.id) : sel?.kind === 'mob' ? sel.mob.id : null}
        onPaddock={reshaping ? undefined : editing ? (row) => setSel({ kind: 'paddock', row }) : onPaddock}
        onMob={reshaping ? undefined : (mob) => setSel({ kind: 'mob', mob })}
        onFeature={reshaping ? undefined : (row) => setSel({ kind: 'feature', row })}
        onIssue={reshaping ? undefined : (row) => setSel({ kind: 'issue', row })}
        onMapClick={() => { if (!editing) setSel(null) }}
        onReady={setLeaflet}
      />

      {/* Top: property and layers */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={() => setPanel(panel === 'property' ? null : 'property')} className="pointer-events-auto min-w-0 max-w-[55%] truncate rounded-full bg-card/95 px-4 py-2.5 text-left font-semibold shadow">
          {String(property.name)}{stock.properties.length > 1 ? ' ▾' : ''}
        </button>
        <div className="pointer-events-auto flex shrink-0 gap-2">
          <button onClick={() => setPanel(panel === 'search' ? null : 'search')} className="rounded-full bg-card/95 px-4 py-2.5 font-semibold shadow">Find</button>
          <button onClick={() => setPanel(panel === 'layers' ? null : 'layers')} className="rounded-full bg-card/95 px-4 py-2.5 font-semibold shadow">Layers</button>
        </div>
      </div>

      {movingMob && (
        <div className="absolute inset-x-3 top-16 z-[1100] flex items-center gap-3 rounded-2xl bg-green px-4 py-3 text-paper shadow">
          <span className="flex-1 text-sm">Tap the paddock to move <b>{movingMob.name}</b> to.</span>
          <button onClick={() => setMovingMob(null)} className="rounded-full bg-paper/15 px-3 py-1 text-sm">Cancel</button>
        </div>
      )}

      {/* Right: locate, report, edit */}
      <div className="absolute right-3 bottom-4 z-[1100] flex flex-col gap-3">
        <RoundButton label="Report an issue" onClick={() => go('/issues/new')} className="bg-[#e0662a] text-white">+</RoundButton>
        <RoundButton label="My location" onClick={() => { setLayer('location', true); setCentreOn((n) => n + 1) }} className={layers.location ? 'bg-[#1a73e8] text-white' : 'bg-card'}>◎</RoundButton>
        <RoundButton label={editing ? 'Stop editing the map' : 'Edit the map'} onClick={() => { if (reshaping) return; setEditing(!editing); setSel(null); cancelDrawing() }} className={editing ? 'bg-butter' : 'bg-card'}>✎</RoundButton>
      </div>
      {!editing && !movingMob && !property.centre_lat && !allPaddocks.some((d) => d.property_id === property.id && isPolygon(d.boundary)) && (
        <div className="absolute inset-x-3 top-16 z-[1100] rounded-2xl bg-card/95 p-4 text-sm shadow">
          <b className="font-semibold">Find {String(property.name)} on the map.</b> Tap <b>Find</b> and search a town, road or address (or tap ◎ to go to where you are), zoom in to the farm, then tap ✎ and <b>Set start view</b>. After that, draw the paddock boundaries.
        </div>
      )}
      {gps.error && layers.location && <div className="absolute inset-x-3 top-16 z-[1100]"><Notice tone="warn">{gps.error}</Notice></div>}

      {reshaping && (
        <div className="absolute inset-x-3 top-16 z-[1100] rounded-2xl bg-butter px-4 py-3 text-sm text-ink shadow">
          Reshaping <b>{reshaping}</b>: drag the corners (they snap to nearby corners, so shared fences line up). Then Save or Cancel below.
        </div>
      )}
      {drawing && (
        <div className="absolute inset-x-3 top-16 z-[1100] rounded-2xl bg-butter p-3 text-ink shadow">
          <div className="text-sm">
            {drawing === 'CircleMarker' ? 'Tap the map where it is.'
              : drawing === 'Line' ? 'Tap along the fence or pipe, one tap per bend. Points snap to nearby corners and fences.'
              : 'Tap each corner of the paddock. Corners snap to neighbouring paddocks so shared fences line up.'}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {drawing !== 'CircleMarker' && <EditButton onClick={finishDrawing}>Finish</EditButton>}
            {drawing !== 'CircleMarker' && <EditButton onClick={() => tool()?._removeLastVertex?.()}>Undo last point</EditButton>}
            <EditButton onClick={cancelDrawing}>Cancel</EditButton>
          </div>
          {notice && <div className="mt-2 text-sm">{notice}</div>}
        </div>
      )}
      {editing && !reshaping && !drawing && (
        <div className="absolute inset-x-3 top-16 z-[1100] rounded-2xl bg-green-deep/95 p-3 text-paper shadow">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-80">Editing the map · tap something to change it</div>
          <div className="flex flex-wrap gap-2">
            <EditButton onClick={() => draw('Polygon')}>Paddock boundary</EditButton>
            <EditButton onClick={() => draw('Line')}>Fence or pipe</EditButton>
            <EditButton onClick={() => draw('CircleMarker')}>Point (trough, gate…)</EditButton>
            <EditButton onClick={async () => {
              if (!leaflet) return
              const c = leaflet.getCenter()
              await edit('properties', String(property.id), { centre_lat: Math.round(c.lat * 1e6) / 1e6, centre_lng: Math.round(c.lng * 1e6) / 1e6, default_zoom: leaflet.getZoom() })
              setNotice('Saved. The map opens here for this property.')
            }}>Set start view</EditButton>
          </div>
          {notice && <div className="mt-2 text-sm">{notice}</div>}
        </div>
      )}

      {panel === 'layers' && (
        <Sheet onClose={() => setPanel(null)} title="Layers">
          <div className="mb-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Background">
            {([['imagery', 'Imagery', 'Aerial photos'], ['map', 'Map', 'Towns, roads, rivers']] as const).map(([id, label, detail]) => (
              <button key={id} role="radio" aria-checked={background === id} onClick={() => { setBg(id); saveBackground(id) }}
                className={`rounded-2xl border-2 px-3 py-2 text-left ${background === id ? 'border-green bg-green/10' : 'border-line'}`}>
                <span className="block font-semibold">{label}</span><span className="text-sm text-muted">{detail}</span>
              </button>
            ))}
          </div>
          {!esriKey() && <p className="mb-2 text-xs text-muted">Zoomed out you see the map of Australia; imagery appears as you zoom in (NSW and Queensland).</p>}
          {LAYERS.map((l) => (
            <div key={l.id} className="flex items-center gap-3 border-b border-line py-3">
              <div className="flex-1"><div className="font-medium">{l.label}</div><div className="text-sm text-muted">{l.detail}</div></div>
              <Toggle label={l.label} on={layers[l.id]} onChange={(v) => setLayer(l.id, v)} />
            </div>
          ))}
          {LATER_LAYERS.map((l) => (
            <div key={l.label} className="flex items-center gap-3 border-b border-line py-3 opacity-50">
              <div className="flex-1"><div className="font-medium">{l.label}</div><div className="text-sm text-muted">{l.detail}</div></div>
            </div>
          ))}
          <p className="mt-3 text-xs text-muted">Layer choices are remembered on this phone.</p>
        </Sheet>
      )}

      {panel === 'search' && <SearchSheet onClose={() => setPanel(null)} onPick={(pl) => {
        if (!leaflet) return
        if (pl.bounds) leaflet.fitBounds(pl.bounds, { maxZoom: 16 })
        else leaflet.setView([pl.lat, pl.lng], 15)
        setPanel(null)
      }} />}

      {panel === 'property' && stock.properties.length > 1 && (
        <Sheet onClose={() => setPanel(null)} title="Property">
          {stock.properties.map((p) => (
            <button key={String(p.id)} onClick={() => chooseProperty(String(p.id))} className="flex w-full items-center justify-between border-b border-line py-3 text-left">
              <span><span className="block font-medium">{String(p.name)}</span><span className="text-sm text-muted">{String(p.pic ?? 'No PIC')}</span></span>
              {p.id === property.id && <span className="text-green">✓</span>}
            </button>
          ))}
        </Sheet>
      )}

      {sel?.kind === 'paddock' && <PaddockSheet key={String(sel.row.id)} onReshaping={setReshaping} row={allPaddocks.find((d) => d.id === sel.row.id) ?? sel.row} editing={editing} mobs={mobs} sprayUntil={sprayUntil.get(String(sel.row.id))} onClose={() => setSel(null)} map={leaflet} restOf={(id) => paddockRest(stock.data, id, todayLocal(), mobHeads(stock.data))} mobName={stock.mobName} />}
      {sel?.kind === 'mob' && (
        <Sheet onClose={() => setSel(null)} title={sel.mob.name}>
          <p className="text-muted">{sel.mob.head} head{sel.mob.paddockId ? ` · ${stock.paddockName(sel.mob.paddockId, sel.mob.propertyId)}` : ''}{sel.mob.underWithhold ? ' · under withhold' : ''}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => { setMovingMob(sel.mob); setSel(null) }}>Move (tap a paddock)</Button>
            <Button kind="secondary" onClick={() => go(`/stock/${sel.mob.id}`)}>Open mob</Button>
          </div>
        </Sheet>
      )}
      {sel?.kind === 'feature' && <FeatureSheet key={String(sel.row.id)} onReshaping={setReshaping} row={features.find((f) => f.id === sel.row.id) ?? sel.row} editing={editing} features={features} onClose={() => setSel(null)} map={leaflet} />}
      {sel?.kind === 'issue' && (
        <Sheet onClose={() => setSel(null)} title={(sel.row.categories as string[] | null)?.join(', ') || 'Issue'}>
          <p className="text-muted">{new Date(String(sel.row.reported_at)).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}{sel.row.notes ? ` · ${sel.row.notes}` : ''}</p>
          <Button className="mt-4 w-full" onClick={() => go(`/issues/${sel.row.id}`)}>Open issue</Button>
        </Sheet>
      )}
      {sel?.kind === 'new-shape' && <NewShapeSheet geometry={sel.geometry} property={property} paddocks={allPaddocks} features={features} onClose={() => setSel(null)} />}
    </div>
  )
}

function SearchSheet({ onClose, onPick }: { onClose: () => void; onPick: (p: Place) => void }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Place[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function run(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try { setResults(await searchPlaces(q, { esriKey: esriKey() })) } catch { setError('Search needs signal. Try again when you have it, or type the coordinates.') } finally { setBusy(false) }
  }
  return (
    <Sheet onClose={onClose} title="Find a place">
      <form onSubmit={run} className="flex gap-2">
        <input autoFocus className={inputClass + ' min-w-0 flex-1'} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Town, road, address or -31.25, 150.9" aria-label="Search for a place" />
        <Button type="submit" disabled={busy || q.trim().length < 3}>{busy ? '…' : 'Search'}</Button>
      </form>
      {error && <div className="mt-3"><Notice tone="warn">{error}</Notice></div>}
      {results && results.length === 0 && <p className="mt-3 text-muted">Nothing found. Try the nearest town or the road name.</p>}
      {results?.map((r, i) => (
        <button key={i} onClick={() => onPick(r)} className="block w-full border-b border-line py-3 text-left">{r.label}</button>
      ))}
      <p className="mt-3 text-xs text-muted">Search © {esriKey() ? 'Esri' : 'OpenStreetMap contributors'}.</p>
    </Sheet>
  )
}

function RoundButton({ label, onClick, className, children }: { label: string; onClick: () => void; className: string; children: ReactNode }) {
  return <button aria-label={label} title={label} onClick={onClick} className={`grid size-13 place-items-center rounded-full text-2xl font-bold shadow-lg ${className}`}>{children}</button>
}
function EditButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className="rounded-full bg-paper px-3 py-2 text-sm font-semibold text-ink">{children}</button>
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-[1200] max-h-[70%] overflow-y-auto rounded-t-3xl bg-card px-5 pt-4 pb-6 shadow-2xl">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h2 className="text-2xl text-green-deep">{title}</h2>
        <button aria-label="Close" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full bg-paper text-xl">×</button>
      </div>
      {children}
    </div>
  )
}

// A reshape left open (sheet closed some other way) is taken off the map.
function useShapeCleanup(shaping: L.Polyline | L.Polygon | null, map: L.Map | null, onReshaping: (name: string | null) => void) {
  useEffect(() => () => {
    if (shaping && map) { shaping.pm.disable(); map.removeLayer(shaping); onReshaping(null) }
  }, [shaping, map, onReshaping])
}

// ---- Paddock ----------------------------------------------------------------

function PaddockSheet({ row, editing, mobs, sprayUntil, onClose, map, restOf, mobName, onReshaping }: {
  row: Row; editing: boolean; mobs: MapMob[]; sprayUntil?: string; onClose: () => void; map: L.Map | null; onReshaping: (name: string | null) => void
  restOf: (id: string) => { grazing: string[]; restedDays: number | null }; mobName: (id: string) => string
}) {
  const { edit } = useSync()
  const [shaping, setShaping] = useState<L.Polygon | null>(null)
  useShapeCleanup(shaping, map, onReshaping)
  const rest = restOf(String(row.id))
  const here = mobs.filter((m) => m.paddockId === row.id && m.head > 0)
  const mapped = isPolygon(row.boundary) ? areaHa(row.boundary) : null
  const area = row.area_overridden || mapped === null ? row.area_ha : mapped

  function startShape() {
    if (!map || !isPolygon(row.boundary)) return
    const poly = L.polygon(row.boundary.coordinates.map((r) => r.map(([lng, lat]) => [lat, lng] as [number, number])), { color: '#feffb9', weight: 3 }).addTo(map)
    poly.pm.enable({ allowSelfIntersection: false, snappable: true, snapDistance: 15 })
    setShaping(poly)
    onReshaping(String(row.name))
  }
  function cancelShape() {
    if (shaping && map) { shaping.pm.disable(); map.removeLayer(shaping) }
    setShaping(null); onReshaping(null)
  }
  async function saveShape() {
    if (!shaping || !map) return
    const g = shaping.toGeoJSON().geometry as Geometry
    shaping.pm.disable(); map.removeLayer(shaping); setShaping(null); onReshaping(null)
    if (g.type !== 'Polygon') return
    await edit('paddocks', String(row.id), { boundary: g, ...(row.area_overridden ? {} : { area_ha: areaHa(g) }) })
  }

  return (
    <Sheet title={String(row.name)} onClose={() => { cancelShape(); onClose() }}>
      <p className="text-muted">
        {[area ? `${Number(area).toLocaleString('en-AU')} ha${row.area_overridden && mapped ? ` (mapped ${mapped} ha)` : ''}` : null,
          rest.grazing.length > 0 ? `Grazing: ${here.map((m) => `${m.name} (${m.head})`).join(', ') || rest.grazing.map(mobName).join(', ')}` : rest.restedDays !== null ? `Rested ${rest.restedDays} days` : 'Not grazed yet in the records'].filter(Boolean).join(' · ')}
      </p>
      {sprayUntil && <div className="mt-3"><Notice tone="alert">Spray withhold: don't graze until {fmtDate(sprayUntil)}. Grazable from the day after.</Notice></div>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button kind="secondary" onClick={() => go(`/setup/paddocks/${row.id}`)}>Paddock details</Button>
        <Button kind="secondary" onClick={() => go(`/issues/new?paddock=${row.id}`)}>Report an issue</Button>
      </div>
      {editing && (
        <div className="mt-3">
          {shaping ? (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button onClick={saveShape}>Save {String(row.name)}'s boundary</Button>
              <Button kind="secondary" onClick={cancelShape}>Cancel</Button>
            </div>
          )
            : isPolygon(row.boundary) ? <Button kind="secondary" className="w-full" onClick={startShape}>Reshape the boundary (drag the corners)</Button>
            : <p className="text-sm text-muted">No boundary yet. Use "Paddock boundary" above to draw it, then choose {String(row.name)}.</p>}
          {!!row.area_overridden && mapped !== null && (
            <Button kind="quiet" className="mt-2 w-full" onClick={() => edit('paddocks', String(row.id), { area_ha: mapped, area_overridden: false })}>Use the mapped area ({mapped} ha)</Button>
          )}
        </div>
      )}
    </Sheet>
  )
}

// ---- A fence, pipe or point -----------------------------------------------------

function FeatureSheet({ row, editing, features, onClose, map, onReshaping }: { row: Row; editing: boolean; features: Row[]; onClose: () => void; map: L.Map | null; onReshaping: (name: string | null) => void }) {
  const { edit } = useSync()
  const t = FEATURE_TYPES[row.feature_type as FeatureType] ?? FEATURE_TYPES.other
  const [name, setName] = useState(String(row.name ?? ''))
  const [notes, setNotes] = useState(String(row.notes ?? ''))
  const [unit, setUnit] = useState(String(row.electric_unit_id ?? ''))
  const [shaping, setShaping] = useState<L.Polyline | null>(null)
  useShapeCleanup(shaping, map, onReshaping)
  const units = features.filter((f) => f.feature_type === 'electric_unit')
  const unitName = units.find((u) => u.id === row.electric_unit_id)?.name
  const geom = row.geometry as Geometry

  function startShape() {
    if (!map || geom.type !== 'LineString') return
    const line = L.polyline(geom.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]), { color: '#feffb9', weight: 4 }).addTo(map)
    line.pm.enable({ snappable: true, snapDistance: 15 })
    setShaping(line)
    onReshaping(String(row.name || t.label))
  }
  async function save() {
    let geometry: Geometry | undefined
    if (shaping && map) { geometry = shaping.toGeoJSON().geometry as Geometry; shaping.pm.disable(); map.removeLayer(shaping); setShaping(null); onReshaping(null) }
    await edit('map_features', String(row.id), { name: name.trim() || null, notes: notes.trim() || null, electric_unit_id: row.feature_type === 'electric_fence' ? unit || null : null, ...(geometry ? { geometry } : {}) })
    onClose()
  }

  if (!editing) {
    return (
      <Sheet title={String(row.name || t.label)} onClose={onClose}>
        <p className="text-muted">{[t.label, unitName ? `on ${unitName}` : null, row.notes].filter(Boolean).join(' · ')}</p>
        <Button kind="secondary" className="mt-4 w-full" onClick={() => go(`/issues/new?feature=${row.id}`)}>Report an issue here</Button>
      </Sheet>
    )
  }
  return (
    <Sheet title={`Edit ${t.label.toLowerCase()}`} onClose={() => { if (shaping && map) { shaping.pm.disable(); map.removeLayer(shaping) } setShaping(null); onReshaping(null); onClose() }}>
      <div className="flex flex-col gap-3">
        <Field id="fname" label="Name"><input id="fname" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        {row.feature_type === 'electric_fence' && (
          <Field id="unit" label="Energiser unit">
            <select id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass}>
              <option value="">None</option>
              {units.map((u) => <option key={String(u.id)} value={String(u.id)}>{String(u.name ?? 'Unit')}</option>)}
            </select>
          </Field>
        )}
        <Field id="fnotes" label="Notes"><input id="fnotes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
        {geom.type === 'LineString' && !shaping && <Button kind="secondary" onClick={startShape}>Reshape (drag the points)</Button>}
        <Button onClick={save}>Save</Button>
        <Button kind="danger" onClick={async () => { await edit('map_features', String(row.id), { archived_at: nowIso() }); onClose() }}>Remove from the map</Button>
      </div>
    </Sheet>
  )
}

// ---- Something just drawn ----------------------------------------------------------

function NewShapeSheet({ geometry, property, paddocks, features, onClose }: { geometry: Geometry; property: Row; paddocks: Row[]; features: Row[]; onClose: () => void }) {
  const { add, edit } = useSync()
  const unmapped = paddocks.filter((d) => d.property_id === property.id && !d.archived_at && !isPolygon(d.boundary))
  const lineTypes: FeatureType[] = ['electric_fence', 'fence', 'pipe']
  const pointTypes: FeatureType[] = ['trough', 'tank', 'dam', 'gate', 'yard', 'electric_unit', 'rain_gauge', 'point', 'other']
  const [paddockId, setPaddockId] = useState(unmapped[0] ? String(unmapped[0].id) : 'new')
  const [name, setName] = useState('')
  const [type, setType] = useState<FeatureType>(geometry.type === 'LineString' ? 'electric_fence' : 'trough')
  const [unit, setUnit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const units = features.filter((f) => f.feature_type === 'electric_unit' && f.property_id === property.id)

  async function save() {
    if (geometry.type === 'Polygon') {
      const ha = areaHa(geometry)
      if (paddockId === 'new') {
        if (!name.trim()) return setError('Name the paddock.')
        await add('paddocks', { property_id: property.id, name: name.trim(), boundary: geometry, area_ha: ha, area_overridden: false })
      } else {
        const d = paddocks.find((x) => x.id === paddockId)!
        await edit('paddocks', paddockId, { boundary: geometry, ...(d.area_overridden ? {} : { area_ha: ha }) })
      }
    } else {
      // Geoman's circle marker comes back as a Point.
      await add('map_features', { property_id: property.id, feature_type: type, name: name.trim() || null, geometry, electric_unit_id: type === 'electric_fence' ? unit || null : null })
    }
    onClose()
  }

  return (
    <Sheet title={geometry.type === 'Polygon' ? 'New paddock boundary' : geometry.type === 'LineString' ? 'New line' : 'New point'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {geometry.type === 'Polygon' ? (
          <>
            <p className="text-sm text-muted">{areaHa(geometry)} ha</p>
            <Field id="which" label="Which paddock is this?">
              <select id="which" value={paddockId} onChange={(e) => setPaddockId(e.target.value)} className={inputClass}>
                {unmapped.map((d) => <option key={String(d.id)} value={String(d.id)}>{String(d.name)}</option>)}
                <option value="new">A new paddock</option>
              </select>
            </Field>
            {paddockId === 'new' && <Field id="pname" label="Paddock name"><input id="pname" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>}
          </>
        ) : (
          <>
            <Field id="type" label="What is it?">
              <select id="type" value={type} onChange={(e) => setType(e.target.value as FeatureType)} className={inputClass}>
                {(geometry.type === 'LineString' ? lineTypes : pointTypes).map((t) => <option key={t} value={t}>{FEATURE_TYPES[t].label}</option>)}
              </select>
            </Field>
            {type === 'electric_fence' && (
              <Field id="unit" label="Energiser unit" hint={units.length === 0 ? 'Add the energiser as a point first to colour its fences.' : undefined}>
                <select id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass}>
                  <option value="">None</option>
                  {units.map((u) => <option key={String(u.id)} value={String(u.id)}>{String(u.name ?? 'Unit')}</option>)}
                </select>
              </Field>
            )}
            <Field id="name" label="Name"><input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder={type === 'electric_unit' ? 'e.g. Unit 1 - House block' : 'e.g. East trough'} /></Field>
          </>
        )}
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save}>Save</Button>
      </div>
    </Sheet>
  )
}
