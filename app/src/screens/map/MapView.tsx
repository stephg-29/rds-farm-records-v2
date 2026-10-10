// The Leaflet map itself: imagery, paddocks, mobs, fences, water, issues and
// GPS. Screens pass the data and what to do when something is tapped.
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Row } from '../../lib/db'
import { areaHa, centroid, isPolygon, type LngLat, type Polygon } from '../../lib/geo'
import { DEA_LAYER, DEA_WMS, NDVI_ATTRIBUTION } from '../../lib/ndvi'
import { loadPack, type SavedPack } from '../../lib/offlineMap'
import { savedTile } from '../../lib/tileCache'
import { TERRAIN_ATTRIBUTION, TERRAIN_MAX_ZOOM, contourInterval, contours, hillshade, pixelMetres, tileFetcher } from '../../lib/terrain'
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
  // A colour for each highlighted paddock (e.g. a job's to do / part / done).
  highlightColours?: Map<string, string>
  // Open on these paddocks (e.g. a contractor's job) rather than the property's start view.
  fitTo?: string[]
  // Paddocks to mark "Livestock" (a contractor's map, where mobs aren't shown).
  stockFlags?: Set<string>
  // Paddocks joined by an open gate (drawn linked).
  joins?: Row[]
  // The satellite pass the NDVI layer shows (YYYY-MM-DD).
  ndviDate?: string | null
  // No signal: the background comes from the property's saved offline map.
  offline?: boolean
  // Bumped after the offline map is saved or removed, to pick it up.
  packVersion?: number
  // false while drawing or reshaping: taps go to the drawing, not to what's under it.
  interactive?: boolean
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
// A tile layer that uses the saved copy of a tile when there is one (the
// offline map), and can build its addresses with a function (WMS images).
type CachedOptions = L.TileLayerOptions & { tileUrl?: (z: number, x: number, y: number) => string }
const CachedTileLayer = L.TileLayer.extend({
  getTileUrl(this: L.TileLayer & { options: CachedOptions }, coords: L.Coords) {
    const f = this.options.tileUrl
    return f ? f(coords.z + (this.options.zoomOffset ?? 0), coords.x, coords.y) : L.TileLayer.prototype.getTileUrl.call(this, coords)
  },
  createTile(this: L.TileLayer & { _tileOnLoad: (...a: unknown[]) => void; _tileOnError: (...a: unknown[]) => void }, coords: L.Coords, done: L.DoneCallback) {
    const img = document.createElement('img')
    L.DomEvent.on(img, 'load', L.Util.bind(this._tileOnLoad, this, done, img))
    L.DomEvent.on(img, 'error', L.Util.bind(this._tileOnError, this, done, img))
    img.alt = ''
    img.setAttribute('role', 'presentation')
    const url = this.getTileUrl(coords)
    savedTile(url).then((local) => {
      if (local) img.addEventListener('load', () => URL.revokeObjectURL(local), { once: true })
      img.src = local ?? url
    })
    return img
  },
})

export function setBackground(group: L.LayerGroup, bg: Background, opts: { offline?: boolean; pack?: SavedPack | null } = {}) {
  group.clearLayers()
  for (const t of backgroundLayers(bg, opts)) {
    // A layer's minZoom only hides that layer; the map's own minZoom (below)
    // decides how far out people can zoom.
    const o: CachedOptions = { attribution: t.attribution, minZoom: t.minZoom ?? 0, maxNativeZoom: t.maxNativeZoom, maxZoom: 21, bounds: t.bounds, tileSize: t.tileSize ?? 256, zoomOffset: t.zoomOffset ?? 0, tileUrl: t.tileUrl }
    new (CachedTileLayer as unknown as new (url: string, o: CachedOptions) => L.TileLayer)(t.url, o).addTo(group)
  }
}

// Shaded relief and contour lines, drawn on the phone from terrain tiles.
const TerrainLayer = L.GridLayer.extend({
  createTile(coords: L.Coords, done: (err: Error | null, tile: HTMLElement) => void) {
    const tile = document.createElement('canvas')
    tile.width = 256; tile.height = 256
    tileFetcher.load(coords.z, coords.x, coords.y).then((h) => {
      if (!h) return done(null, tile)
      const ctx = tile.getContext('2d')!
      const n = 2 ** coords.z
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (coords.y + 0.5)) / n))) * 180) / Math.PI
      const shade = hillshade(h, 256, pixelMetres(coords.z, lat))
      const img = ctx.createImageData(256, 256)
      for (let i = 0; i < shade.length; i++) {
        // Dark on the shady side, a little light on the sunny side.
        const v = shade[i]
        const dark = v < 0.7
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = dark ? 20 : 255
        img.data[i * 4 + 3] = dark ? Math.round((0.7 - v) * 230) : Math.round((v - 0.7) * 120)
      }
      ctx.putImageData(img, 0, 0)
      const interval = contourInterval(coords.z)
      for (const [x1, y1, x2, y2, level] of contours(h, 256, interval)) {
        const major = level % (interval * 5) === 0
        ctx.strokeStyle = major ? 'rgba(255,236,190,0.95)' : 'rgba(255,236,190,0.6)'
        ctx.lineWidth = major ? 1.6 : 0.8
        ctx.beginPath(); ctx.moveTo(x1 + 0.5, y1 + 0.5); ctx.lineTo(x2 + 0.5, y2 + 0.5); ctx.stroke()
      }
      done(null, tile)
    })
    return tile
  },
})

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
  const overlay = useRef<L.LayerGroup | null>(null)

  // Create the map once.
  useEffect(() => {
    if (!box.current || map.current) return
    // Starts on the whole of Australia until a property has a start view.
    const m = L.map(box.current, { zoomControl: false, attributionControl: false, minZoom: 3, maxZoom: 21 }).setView([-27.5, 134], 4)
    // Development only: the map, for checking views from the browser console.
    if (import.meta.env.DEV) (window as unknown as { frMap?: L.Map }).frMap = m
    bgLayer.current = L.layerGroup().addTo(m)
    // Elevation and NDVI sit between the background and the farm's own layers.
    overlay.current = L.layerGroup().addTo(m)
    // Credits along the bottom left, the zoom buttons stacked above them (so
    // long credits on a phone never cover the buttons).
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(m)
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

  const propertyId = p.property ? String(p.property.id) : null
  useEffect(() => {
    if (bgLayer.current) setBackground(bgLayer.current, p.background ?? 'imagery', { offline: p.offline, pack: propertyId ? loadPack(propertyId) : null })
  }, [p.background, p.offline, propertyId, p.packVersion])

  useEffect(() => {
    const g = overlay.current
    if (!g) return
    g.clearLayers()
    if (p.layers.ndvi && p.ndviDate) {
      L.tileLayer.wms(DEA_WMS, {
        layers: DEA_LAYER, styles: 'ndvi', format: 'image/png', transparent: true, version: '1.3.0', opacity: 0.8,
        attribution: NDVI_ATTRIBUTION, maxZoom: 21, time: p.ndviDate,
      } as L.WMSOptions).addTo(g)
    }
    if (p.layers.elevation) {
      new (TerrainLayer as unknown as new (o: L.GridLayerOptions) => L.GridLayer)({ maxNativeZoom: TERRAIN_MAX_ZOOM, maxZoom: 21, attribution: TERRAIN_ATTRIBUTION } as L.GridLayerOptions).addTo(g)
    }
  }, [p.layers.ndvi, p.layers.elevation, p.ndviDate])

  // Fit to the property when it changes.
  useEffect(() => {
    const m = map.current
    if (!m || !p.property || fitted.current === p.property.id) return
    fitted.current = String(p.property.id)
    const shapes = p.paddocks.filter((d) => d.property_id === p.property!.id && isPolygon(d.boundary))
    const focus = shapes.filter((d) => p.fitTo?.includes(String(d.id)))
    if (focus.length > 0) {
      m.fitBounds(L.geoJSON(focus.map((d) => d.boundary) as never).getBounds(), { padding: [30, 30], maxZoom: 17 })
    } else if (p.fitTo && shapes.length === 0) {
      // The job's paddocks haven't arrived on this phone yet: wait for them.
      fitted.current = null
      return
    } else if (p.property.centre_lat && p.property.centre_lng) {
      m.setView([Number(p.property.centre_lat), Number(p.property.centre_lng)], Number(p.property.default_zoom ?? 15))
    } else if (shapes.length > 0) {
      m.fitBounds(L.geoJSON(shapes.map((d) => d.boundary) as never).getBounds(), { padding: [30, 30] })
    }
  }, [p.property, p.paddocks, p.fitTo])

  // Draw everything (cheap at farm scale, so redraw on any change).
  useEffect(() => {
    const g = groups.current
    if (!map.current) return
    for (const k in g) g[k].clearLayers()
    const propId = p.property?.id
    const here = (r: Row) => !propId || r.property_id === propId
    const units = p.features.filter((f) => f.feature_type === 'electric_unit')
    const unitColor = (id: unknown) => UNIT_COLORS[Math.max(0, units.findIndex((u) => u.id === id)) % UNIT_COLORS.length]
    const tappable = p.interactive !== false

    // Paddocks
    // Biggest first, so a smaller paddock inside or over another stays tappable.
    const size = (d: Row) => (isPolygon(d.boundary) ? areaHa(d.boundary) : 0)
    for (const d of p.paddocks.filter(here).sort((a, b) => size(b) - size(a))) {
      if (!isPolygon(d.boundary)) continue
      const picked = p.highlight?.has(String(d.id))
      const pickColour = p.highlightColours?.get(String(d.id)) ?? '#feffb9'
      const spray = p.sprayUntil?.get(String(d.id))
      const poly = L.polygon(d.boundary.coordinates.map((ring) => ring.map(toLatLng)) as L.LatLngExpression[][], {
        color: picked ? pickColour : p.selectedId === d.id ? '#ffffff' : '#fffdfb',
        weight: picked ? 4 : 2, opacity: 0.9,
        fillColor: picked ? pickColour : '#414b3b', fillOpacity: picked ? 0.28 : 0.08, interactive: tappable,
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

    // Joined paddocks: a dashed line between their centres, marked "gate open".
    for (const j of (p.joins ?? []).filter((x) => !x.deleted_at && !x.closed_on && Array.isArray(x.paddock_ids))) {
      const cs = (j.paddock_ids as string[]).map((id) => p.paddocks.find((d) => d.id === id)).filter((d): d is Row => !!d && isPolygon(d.boundary) && here(d)).map((d) => toLatLng(centroid(d.boundary as Polygon)))
      if (cs.length < 2) continue
      L.polyline(cs, { color: '#7fd3ff', weight: 3, dashArray: '2 8', lineCap: 'round', interactive: false }).addTo(g.paddocks)
      const mid = cs.slice(0, 2) as [number, number][]
      L.marker([(mid[0][0] + mid[1][0]) / 2, (mid[0][1] + mid[1][1]) / 2], { interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="fr-pdk-label" style="transform:translate(-50%,-50%);background:#e6f6ff;color:#0b4d6e">gate open</div>' }) }).addTo(g.paddocks)
    }

    // Lines and points
    for (const f of p.features.filter(here)) {
      const t = FEATURE_TYPES[f.feature_type as FeatureType] ?? FEATURE_TYPES.other
      if (!p.layers[t.layer as LayerId]) continue
      const geom = f.geometry as { type: string; coordinates: unknown }
      const color = f.feature_type === 'electric_fence' ? unitColor(f.electric_unit_id) : t.color
      let layer: L.Layer
      if (geom?.type === 'LineString') {
        layer = L.polyline((geom.coordinates as LngLat[]).map(toLatLng), { color, weight: f.feature_type === 'pipe' ? 3 : 4, opacity: 0.95, dashArray: f.feature_type === 'pipe' ? '8 6' : undefined, interactive: tappable })
      } else if (geom?.type === 'Point') {
        const ll = toLatLng(geom.coordinates as LngLat)
        layer = f.feature_type === 'electric_unit'
          ? L.marker(ll, { interactive: tappable, icon: L.divIcon({ className: '', html: `<div class="fr-unit" style="background:${unitColor(f.id)}">⚡</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
          : L.circleMarker(ll, { radius: 7, color: '#fffdfb', weight: 2, fillColor: color, fillOpacity: 1, interactive: tappable })
      } else continue
      layer.on('click', (e) => { L.DomEvent.stopPropagation(e as L.LeafletEvent); handlers.current.onFeature?.(f) })
      layer.addTo(g[t.layer] ?? g.fences)
    }

    // Issues
    if (p.layers.issues) {
      for (const i of p.issues.filter((x) => x.status !== 'done' && x.lat && x.lng && here(x))) {
        L.marker([Number(i.lat), Number(i.lng)], { interactive: tappable, icon: L.divIcon({ className: '', html: '<div class="fr-issue">!</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) })
          .on('click', (e) => { L.DomEvent.stopPropagation(e); handlers.current.onIssue?.(i) })
          .addTo(g.issues)
      }
    }

    // "Livestock recorded here", without names or numbers
    for (const pid of p.stockFlags ?? []) {
      const d = p.paddocks.find((x) => x.id === pid)
      if (!d || !isPolygon(d.boundary) || !here(d)) continue
      const c = centroid(d.boundary)
      L.marker([c[1], c[0]], { interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="fr-mob fr-mob-whp" style="transform:translate(-50%, 14px)">⚠ Livestock</div>' }) }).addTo(g.stock)
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
            interactive: tappable,
            icon: L.divIcon({
              className: '', iconSize: [0, 0],
              html: `<div class="fr-mob ${m.underWithhold ? 'fr-mob-whp' : ''} ${p.selectedId === m.id ? 'fr-mob-sel' : ''}" style="transform:translate(-50%, ${14 + i * 30}px)">${esc(m.name)} · <b>${m.head}</b></div>`,
            }),
          }).on('click', (e) => { L.DomEvent.stopPropagation(e); handlers.current.onMob?.(m) }).addTo(g.stock)
        })
      }
    }
  }, [p.property, p.paddocks, p.features, p.issues, p.mobs, p.layers, p.highlight, p.selectedId, p.sprayUntil, p.interactive, p.stockFlags, p.highlightColours, p.joins])

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
