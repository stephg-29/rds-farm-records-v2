// Issues: report a problem in the paddock (GPS, paddock, nearest feature,
// categories, photos, notes), the list of issues, and one issue.
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Row } from '../lib/db'
import { attachFiles, useAttachments, useFileUrl } from '../lib/files'
import { centroid, inPolygon, isPolygon, nearest, type Geometry, type LngLat } from '../lib/geo'
import { FEATURE_TYPES, loadLayers, type FeatureType } from '../lib/mapStyle'
import { MapView } from './map/MapView'
import { useGps } from '../lib/useGps'
import { useOffline, useSync, useTable } from '../lib/useSync'
import { Button, Card, Choice, Empty, Field, Notice, Page, go, inputClass, query } from '../ui'

const STATUS = [{ value: 'new', label: 'New' }, { value: 'in_progress', label: 'Being fixed' }, { value: 'done', label: 'Done' }] as const

function whereIs(pt: LngLat, paddocks: Row[], features: Row[]) {
  const paddock = paddocks.find((d) => isPolygon(d.boundary) && inPolygon(pt, d.boundary))
  const near = nearest(pt, features.filter((f) => f.geometry).map((f) => ({ item: f, geometry: f.geometry as Geometry })), 50)
  return { paddock, near }
}
const featureLabel = (f: Row) => String(f.name || FEATURE_TYPES[f.feature_type as FeatureType]?.label || 'Feature')

// ---- Report a farm problem ---------------------------------------------------------

export function IssueNew() {
  const paddocks = (useTable('paddocks') ?? []).filter((d) => !d.archived_at)
  const features = (useTable('map_features') ?? []).filter((f) => !f.archived_at)
  const lists = useTable('pick_lists')
  const { saveAll, ctx } = useSync()
  const gps = useGps(true)
  const q = query()
  // Started from a paddock or feature on the map: put the pin there.
  const start = (() => {
    const f = features.find((x) => x.id === q.get('feature'))
    if (f && (f.geometry as Geometry).type === 'Point') return (f.geometry as { coordinates: LngLat }).coordinates
    const d = paddocks.find((x) => x.id === q.get('paddock'))
    return d && isPolygon(d.boundary) ? centroid(d.boundary) : null
  })()
  const [pin, setPin] = useState<LngLat | null>(null)
  const [moved, setMoved] = useState(false)
  const [cats, setCats] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reportedAt] = useState(() => new Date())
  const categories = (lists ?? []).filter((l) => l.list_name === 'issue_category' && !l.archived_at).sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((l) => String(l.value))

  // Dragged by hand, else the paddock or feature it was started from, else GPS.
  const point: LngLat | null = moved ? pin : start ?? (gps.fix ? [gps.fix.lng, gps.fix.lat] : null)
  const usingGps = !moved && !start && !!gps.fix
  const at = point ? whereIs(point, paddocks, features) : null

  async function save() {
    if (cats.length === 0) return setError('Pick at least one category.')
    if (!point) return setError('Waiting for GPS. Drag the pin to the spot, or try again outside.')
    setSaving(true)
    const id = crypto.randomUUID()
    const photoRecords = await attachFiles(ctx.db, 'issues', id, photos)
    await saveAll([{ table: 'issues', values: {
      id, reported_at: reportedAt.toISOString(), categories: cats, notes: notes.trim() || null,
      lat: Math.round(point[1] * 1e6) / 1e6, lng: Math.round(point[0] * 1e6) / 1e6,
      gps_accuracy_m: usingGps ? gps.fix!.accuracy : null,
      property_id: at?.paddock?.property_id ?? null, paddock_id: at?.paddock?.id ?? null,
      map_feature_id: at?.near?.item.id ?? null, status: 'new',
    } }, ...photoRecords])
    go(`/issues/${id}`)
  }

  return (
    <Page title="Report a problem" kicker="Farm problems" back="/map">
      <p className="mt-2 text-sm text-muted">{reportedAt.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
      <p className="mt-4 mb-1 text-xs text-muted">Tap the map or drag the pin to the spot.</p>
      <IssueMap point={point} paddocks={paddocks} features={features} gpsFix={gps.fix} onMove={(p) => { setPin(p); setMoved(true) }} />
      <p className="mt-2 text-sm text-muted">
        {moved ? 'Pin placed by hand.' : start ? 'Pin at the spot chosen on the map. Drag it if needed.' : gps.fix ? `GPS ±${gps.fix.accuracy} m.` : gps.error ?? 'Finding GPS…'}
        {' '}{at?.paddock ? `In ${String(at.paddock.name)}.` : point ? 'Not inside a mapped paddock.' : ''}
        {at?.near ? ` Nearest: ${featureLabel(at.near.item)}, ${Math.round(at.near.distanceM)} m.` : ''}
        {(moved || start) && gps.fix && <button className="ml-1 font-semibold underline" onClick={() => { setPin([gps.fix!.lng, gps.fix!.lat]); setMoved(true) }}>Use my GPS</button>}
      </p>

      <div className="mt-5 mb-2 text-sm font-semibold text-muted">What's wrong (pick any)</div>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const on = cats.includes(c)
          return <button key={c} onClick={() => setCats((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))} aria-pressed={on}
            className={`h-11 rounded-full border px-4 text-sm font-semibold ${on ? 'border-green bg-green text-paper' : 'border-line bg-card'}`}>{c}</button>
        })}
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <PhotoPicker photos={photos} onChange={setPhotos} />
        <Field id="notes" label="Notes"><textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} h-auto py-3`} placeholder="e.g. float valve stuck, trough overflowing" /></Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save problem'}</Button>
        <p className="text-xs text-muted">Saved on the phone straight away; it sends when there's signal.</p>
      </div>
    </Page>
  )
}

export function PhotoPicker({ photos, onChange }: { photos: File[]; onChange: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden
        onChange={(e) => { onChange([...photos, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
      <Button kind="secondary" className="w-full" onClick={() => input.current?.click()}>{photos.length ? `Take another photo (${photos.length})` : 'Take a photo'}</Button>
      {photos.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {photos.map((f, i) => <LocalThumb key={i} file={f} onRemove={() => onChange(photos.filter((_, j) => j !== i))} />)}
        </div>
      )}
    </div>
  )
}

function LocalThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url] = useState(() => URL.createObjectURL(file))
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    <div className="relative shrink-0">
      <img src={url} alt="" className="size-20 rounded-xl object-cover" />
      <button aria-label="Remove photo" onClick={onRemove} className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-ink text-xs text-paper">×</button>
    </div>
  )
}

// The issue's spot on the farm map: big, opening on the property, with the
// paddocks, fences and water around it (as on a contractor's job). With
// onMove, tap or drag to place the pin.
function IssueMap({ point, paddocks, features, onMove, gpsFix }: {
  point: LngLat | null; paddocks: Row[]; features: Row[]; onMove?: (p: LngLat) => void; gpsFix?: { lat: number; lng: number; accuracy: number } | null
}) {
  const properties = (useTable('properties') ?? []).filter((p) => !p.archived_at)
  const [leaflet, setLeaflet] = useState<L.Map | null>(null)
  const offline = useOffline()
  const marker = useRef<L.Marker | null>(null)
  const onMoveRef = useRef(onMove)
  useEffect(() => { onMoveRef.current = onMove })
  // The property the spot is on, else the one last open on the map.
  const inPaddock = point ? paddocks.find((d) => isPolygon(d.boundary) && inPolygon(point, d.boundary)) : undefined
  const lastOpen = (() => { try { return localStorage.getItem('fr-map-property') } catch { return null } })()
  const property = properties.find((p) => p.id === inPaddock?.property_id) ?? properties.find((p) => p.id === lastOpen) ?? properties[0]
  const layers = { ...loadLayers(), paddocks: true, fences: true, electric: true, water: true, stock: false, issues: false, sprays: false, location: !!gpsFix }

  useEffect(() => {
    if (!leaflet || !point) return
    const ll: L.LatLngExpression = [point[1], point[0]]
    if (!marker.current) {
      marker.current = L.marker(ll, { draggable: !!onMoveRef.current, icon: L.divIcon({ className: '', html: '<div class="fr-issue">!</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(leaflet)
      marker.current.on('dragend', () => { const p = marker.current!.getLatLng(); onMoveRef.current?.([p.lng, p.lat]) })
      leaflet.setView(ll, Math.max(leaflet.getZoom(), 17))
    } else {
      marker.current.setLatLng(ll)
    }
  }, [leaflet, point])
  useEffect(() => () => { marker.current = null }, [leaflet])

  return (
    <div className="h-[65vh] min-h-96 overflow-hidden rounded-2xl border border-line">
      <MapView property={property} paddocks={paddocks} features={features} issues={[]} mobs={[]} gps={gpsFix ?? null} layers={layers}
        interactive={false} offline={offline} onMapClick={(p) => onMoveRef.current?.(p)} onReady={setLeaflet} />
    </div>
  )
}

// ---- The list ---------------------------------------------------------------------

export function IssueList() {
  const issues = useTable('issues')
  const paddocks = useTable('paddocks') ?? []
  const [show, setShow] = useState<'open' | 'all'>('open')
  const list = (issues ?? []).filter((i) => show === 'all' || i.status !== 'done').sort((a, b) => String(b.reported_at).localeCompare(String(a.reported_at)))
  return (
    <Page title="Farm problems" kicker="More" back="/more" action={<Button className="shrink-0" onClick={() => go('/issues/new')}>Report</Button>}>
      <div className="mt-4"><Choice value={show} onChange={setShow} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} /></div>
      <div className="mt-4">
        {issues && list.length === 0 && <Empty>{show === 'open' ? 'No open farm problems.' : 'No farm problems reported yet.'}</Empty>}
        {list.length > 0 && (
          <Card>
            {list.map((i) => (
              <button key={String(i.id)} onClick={() => go(`/issues/${i.id}`)} className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-paper">
                <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${i.status === 'done' ? 'bg-green' : i.status === 'in_progress' ? 'bg-amber' : 'bg-[#e0662a]'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{(i.categories as string[]).join(', ')}</span>
                  <span className="block text-sm text-muted">
                    {new Date(String(i.reported_at)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    {i.paddock_id ? ` · ${String(paddocks.find((d) => d.id === i.paddock_id)?.name ?? '')}` : ''}
                    {i.notes ? ` · ${i.notes}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">{STATUS.find((s) => s.value === i.status)?.label}</span>
              </button>
            ))}
          </Card>
        )}
      </div>
    </Page>
  )
}

// ---- One issue ----------------------------------------------------------------------

export function IssueScreen({ id }: { id: string }) {
  const issues = useTable('issues')
  if (!issues) return null
  const i = issues.find((x) => x.id === id)
  if (!i) return <Page title="Not found" back="/issues"><p className="mt-4 text-muted">That problem has been deleted or isn't on this phone.</p></Page>
  return <IssueDetail key={id} issue={i} />
}

function IssueDetail({ issue }: { issue: Row }) {
  const { edit, remove, saveAll, ctx } = useSync()
  const paddocks = useTable('paddocks') ?? []
  const features = useTable('map_features') ?? []
  const attachments = useAttachments('issues', String(issue.id))
  const [notes, setNotes] = useState(String(issue.notes ?? ''))
  const [more, setMore] = useState<File[]>([])
  const [confirm, setConfirm] = useState(false)
  const paddock = paddocks.find((d) => d.id === issue.paddock_id)
  const feature = features.find((f) => f.id === issue.map_feature_id)

  return (
    <Page title={(issue.categories as string[]).join(', ') || 'Farm problem'} kicker="Farm problem" back="/issues">
      <p className="mt-2 text-muted">
        {new Date(String(issue.reported_at)).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
        {paddock ? ` · ${String(paddock.name)}` : ''}{feature ? ` · near ${featureLabel(feature)}` : ''}
        {issue.gps_accuracy_m ? ` · GPS ±${issue.gps_accuracy_m} m` : ''}
      </p>
      {!!issue.lat && <div className="mt-4"><IssueMap point={[Number(issue.lng), Number(issue.lat)]} paddocks={paddocks} features={features.filter((f) => !f.archived_at)} /></div>}
      <div className="mt-4"><Choice value={String(issue.status)} onChange={(v) => edit('issues', String(issue.id), { status: v })} options={[...STATUS]} /></div>
      {attachments.length > 0 && <div className="mt-4 grid grid-cols-3 gap-2">{attachments.map((a) => <Photo key={String(a.id)} a={a} />)}</div>}
      <div className="mt-5 flex flex-col gap-4">
        <Field id="notes" label="Notes"><textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} h-auto py-3`} /></Field>
        <PhotoPicker photos={more} onChange={setMore} />
        <Button onClick={async () => {
          const photos = await attachFiles(ctx.db, 'issues', String(issue.id), more)
          await saveAll(photos, [{ table: 'issues', id: String(issue.id), changes: { notes: notes.trim() || null } }])
          setMore([])
        }}>Save</Button>
      </div>
      <div className="mt-10">
        {confirm ? (
          <div className="flex gap-2">
            <Button kind="danger" className="flex-1" onClick={async () => { await remove('issues', String(issue.id)); go('/issues') }}>Yes, delete it</Button>
            <Button kind="secondary" onClick={() => setConfirm(false)}>Keep</Button>
          </div>
        ) : <Button kind="danger" className="w-full" onClick={() => setConfirm(true)}>Delete this problem</Button>}
        <p className="mt-2 text-center text-xs text-muted">To close it, set it to Done instead. Deleting is for mistakes.</p>
      </div>
    </Page>
  )
}

export function Photo({ a }: { a: Row }) {
  const url = useFileUrl(a)
  if (!url) return <div className="grid aspect-square place-items-center rounded-xl bg-paper text-xs text-muted">{String(a.mime_type ?? '').startsWith('image') ? 'Photo (needs signal)' : String(a.file_name)}</div>
  if (!String(a.mime_type ?? '').startsWith('image')) return <a href={url} target="_blank" rel="noreferrer" className="grid aspect-square place-items-center rounded-xl bg-paper p-2 text-center text-xs underline">{String(a.file_name)}</a>
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={String(a.file_name)} className="aspect-square w-full rounded-xl object-cover" /></a>
}
