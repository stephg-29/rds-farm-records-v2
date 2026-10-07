// The Leaflet map itself: imagery, paddocks, mobs, fences, water, issues and
// GPS. Screens pass the data and what to do when something is tapped.
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Row } from '../../lib/db'
import { centroid, isPolygon, type LngLat } from '../../lib/geo'
import { FEATURE_TYPES, UNIT_COLORS, backgroundLayers, type Background, type FeatureType, type LayerId } from '../../lib/mapStyle'

export type MapMob = { id: string; name: string; head: number; propertyId: string; paddockId: string | null; underWithhold: boolean }
export type Gps = { lat: number; lng: number; accuracy: number } | null

type Props = {
  property: Row | undefined
  paddocks: Row[]
  features: Row[]
  issues: Row[]
  mobs: MapMob[]
  sprayUntil?: Map<string, string>
  layers: Record<LayerId, boolean>
  background?: Background
  // Paddocks to pick out (a contractor's job, or where a mob is moving).
  highlight?: Set<string>
  selectedId?: string | null
  gps: Gps
  // Changes when the person asks to centre on their location.
  centreOn?: number
  onPaddock?: (p: Row) => void
  onMob?: (m: MapMob) => void
  onFeature?: (f: Row) => void
  onIssue?: (i: Row) => void
  onMapClick?: (lngLat: LngLat) => void
  onReady?: (map: L.Map) => void
}

const toLatLng = ([lng, lat]: LngLat): L.LatLngExpression => [lat, lng]
// The background tiles (base map, then imagery over it) into one group.
export function setBackground(group: L.LayerGroup, bg: Background) {
  group.clearLayers()
  for (const t of backgroundLayers(bg)) {
    L.tileLayer(t.url, { attribution: t.attribution, minZoom: t.minZoom, maxNativeZoom: t.maxNativeZoom, maxZoom: 21, bounds: t.bounds, tileSize: t.tileSize ?? 256, zoomOffset: t.zoomOffset ?? 0 }).addTo(group)
  }
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function MapView(p: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const groups = useRef<Record<string, L.LayerGroup>>({})
  const gpsLayer = useRef<L.LayerGroup | null>(null)
  const fitted = useRef<string | null>(null)
  const handlers = useRef(p)
  useEffect(() => { handlers.current = p })
  const centred = useRef(0)
  const bgLayer = useRef<L.LayerGroup | null>(null)

  // Create the map once.
  useEffect(() => {
    if (!box.current || map.current) return
    // Starts on the whole of Australia until a property has a start view.
    const m = L.map(box.current, { zoomControl: false, attributionControl: true, maxZoom: 21 }).setView([-27.5, 134], 4)
    bgLayer.current = L.layerGroup().addTo(m)
    L.control.zoom({ position: 'bottomleft' }).addTo(m)
    for (const k of ['paddocks', 'sprays', 'fences', 'water', 'electric', 'issues', 'stock', 'highlight']) groups.current[k] = L.layerGroup().addTo(m)
    gpsLayer.current = L.layerGroup().addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => handlers.current.onMapClick?.([e.latlng.lng, e.latlng.lat]))
    map.current = m
    // Development only: lets automated tests drive the map.
    if (import.meta.env.DEV) (window as unknown as { __frMap?: L.Map }).__frMap = m
    handlers.current.onReady?.(m)
    return () => { m.remove(); map.current = null; fitted.current = null }
  }, [])

  useEffect(() => { if (bgLayer.current) setBackground(bgLayer.current, p.background ?? 'imagery') }, [p.background])

  // Fit to the property when it changes.
  useEffect(() => {
    const m = map.current
    if (!m || !p.property || fitted.current === p.property.id) return
    fitted.current = String(p.property.id)
    const shapes = p.paddocks.filter((d) => d.property_id === p.property!.id && isPolygon(d.boundary))
    if (p.property.centre_lat && p.property.centre_lng) {
      m.setView([Number(p.property.centre_lat), Number(p.property.centre_lng)], Number(p.property.default_zoom ?? 15))
    } else if (shapes.length > 0) {
      m.fitBounds(L.geoJSON(shapes.map((d) => d.boundary) as never).getBounds(), { padding: [30, 30] })
    }
  }, [p.property, p.paddocks])

  // Draw everything (cheap at farm scale, so redraw on any change).
  useEffect(() => {
    const g = groups.current
    if (!map.current) return
    for (const k in g) g[k].clearLayers()
    const propId = p.property?.id
    const here = (r: Row) => !propId || r.property_id === propId
    const units = p.features.filter((f) => f.feature_type === 'electric_unit')
    const unitColor = (id: unknown) => UNIT_COLORS[Math.max(0, units.findIndex((u) => u.id === id)) % UNIT_COLORS.length]

    // Paddocks
    for (const d of p.paddocks.filter(here)) {
      if (!isPolygon(d.boundary)) continue
      const picked = p.highlight?.has(String(d.id))
      const spray = p.sprayUntil?.get(String(d.id))
      const poly = L.polygon(d.boundary.coordinates.map((ring) => ring.map(toLatLng)) as L.LatLngExpression[][], {
        color: picked ? '#feffb9' : p.selectedId === d.id ? '#ffffff' : '#fffdfb',
        weight: picked ? 4 : 2, opacity: 0.9,
        fillColor: picked ? '#feffb9' : '#414b3b', fillOpacity: picked ? 0.28 : 0.08,
      })
      poly.on('click', (e) => { L.DomEvent.stopPropagation(e); handlers.current.onPaddock?.(d) })
      if (p.layers.paddocks || picked) {
        poly.addTo(picked ? g.highlight : g.paddocks)
        L.marker(toLatLng(centroid(d.boundary)), {
          interactive: false,
          icon: L.divIcon({ className: '', html: `<div class="fr-pdk-label">${esc(d.name)}</div>`, iconSize: [0, 0] }),
        }).addTo(g.paddocks)
      }
      if (spray && p.layers.sprays) {
        L.polygon(d.boundary.coordinates.map((ring) => ring.map(toLatLng)) as L.LatLngExpression[][], {
          color: '#a4471f', weight: 2, dashArray: '6 6', fillColor: '#a4471f', fillOpacity: 0.18, interactive: false,
        }).addTo(g.sprays)
      }
    }

    // Lines and points
    for (const f of p.features.filter(here)) {
      const t = FEATURE_TYPES[f.feature_type as FeatureType] ?? FEATURE_TYPES.other
      if (!p.layers[t.layer as LayerId]) continue
      const geom = f.geometry as { type: string; coordinates: unknown }
      const color = f.feature_type === 'electric_fence' ? unitColor(f.electric_unit_id) : t.color
      let layer: L.Layer
      if (geom?.type === 'LineString') {
        layer = L.polyline((geom.coordinates as LngLat[]).map(toLatLng), { color, weight: f.feature_type === 'pipe' ? 3 : 4, opacity: 0.95, dashArray: f.feature_type === 'pipe' ? '8 6' : undefined })
      } else if (geom?.type === 'Point') {
        const ll = toLatLng(geom.coordinates as LngLat)
        layer = f.feature_type === 'electric_unit'
          ? L.marker(ll, { icon: L.divIcon({ className: '', html: `<div class="fr-unit" style="background:${unitColor(f.id)}">⚡</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
          : L.circleMarker(ll, { radius: 7, color: '#fffdfb', weight: 2, fillColor: color, fillOpacity: 1 })
      } else continue
      layer.on('click', (e) => { L.DomEvent.stopPropagation(e as L.LeafletEvent); handlers.current.onFeature?.(f) })
      layer.addTo(g[t.layer] ?? g.fences)
    }

    // Issues
    if (p.layers.issues) {
      for (const i of p.issues.filter((x) => x.status !== 'done' && x.lat && x.lng && here(x))) {
        L.marker([Number(i.lat), Number(i.lng)], { icon: L.divIcon({ className: '', html: '<div class="fr-issue">!</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) })
          .on('click', (e) => { L.DomEvent.stopPropagation(e); handlers.current.onIssue?.(i) })
          .addTo(g.issues)
      }
    }

    // Mobs, stacked on their paddock's centre
    if (p.layers.stock) {
      const byPaddock = new Map<string, MapMob[]>()
      for (const m of p.mobs.filter((x) => x.head > 0 && x.paddockId && (!propId || x.propertyId === propId))) {
        byPaddock.set(m.paddockId!, [...(byPaddock.get(m.paddockId!) ?? []), m])
      }
      for (const [pid, list] of byPaddock) {
        const d = p.paddocks.find((x) => x.id === pid)
        if (!d || !isPolygon(d.boundary)) continue
        const c = centroid(d.boundary)
        list.forEach((m, i) => {
          L.marker([c[1], c[0]], {
            icon: L.divIcon({
              className: '', iconSize: [0, 0],
              html: `<div class="fr-mob ${m.underWithhold ? 'fr-mob-whp' : ''} ${p.selectedId === m.id ? 'fr-mob-sel' : ''}" style="transform:translate(-50%, ${14 + i * 30}px)">${esc(m.name)} · <b>${m.head}</b></div>`,
            }),
          }).on('click', (e) => { L.DomEvent.stopPropagation(e); handlers.current.onMob?.(m) }).addTo(g.stock)
        })
      }
    }
  }, [p.property, p.paddocks, p.features, p.issues, p.mobs, p.layers, p.highlight, p.selectedId, p.sprayUntil])

  // My location
  useEffect(() => {
    const g = gpsLayer.current
    if (!g) return
    g.clearLayers()
    if (!p.gps || !p.layers.location) return
    const ll: L.LatLngExpression = [p.gps.lat, p.gps.lng]
    L.circle(ll, { radius: p.gps.accuracy, color: '#1a73e8', weight: 1, fillColor: '#1a73e8', fillOpacity: 0.12, interactive: false }).addTo(g)
    L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1, interactive: false }).addTo(g)
    if (p.centreOn && p.centreOn !== centred.current) {
      centred.current = p.centreOn
      map.current?.setView(ll, Math.max(map.current.getZoom(), 16))
    }
  }, [p.gps, p.layers.location, p.centreOn])

  return <div ref={box} className="h-full w-full bg-green-deep" />
}
