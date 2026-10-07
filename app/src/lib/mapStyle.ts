// Map colours and layer groups, carried over from the Fence Map so it looks
// the same to people who already use it.
import { loadConfig } from './config'

export const UNIT_COLORS = ['#e0662a', '#2f6db3', '#7a4fb0', '#2a8f5c', '#c2437e', '#8a7a2a', '#3aa0a8', '#a05c2f']

export const FEATURE_TYPES = {
  electric_fence: { label: 'Electric fence', layer: 'electric', kind: 'line', color: '#e0662a' },
  fence: { label: 'Fence', layer: 'fences', kind: 'line', color: '#d9d2bd' },
  pipe: { label: 'Water pipe', layer: 'water', kind: 'line', color: '#1f7ec2' },
  trough: { label: 'Trough', layer: 'water', kind: 'point', color: '#2f86c9' },
  tank: { label: 'Tank', layer: 'water', kind: 'point', color: '#7a6b8f' },
  dam: { label: 'Dam', layer: 'water', kind: 'point', color: '#3aa0a8' },
  gate: { label: 'Gate', layer: 'fences', kind: 'point', color: '#5c7a4f' },
  yard: { label: 'Yards', layer: 'fences', kind: 'point', color: '#8a7a5c' },
  electric_unit: { label: 'Energiser unit', layer: 'electric', kind: 'point', color: '#e0662a' },
  rain_gauge: { label: 'Rain gauge', layer: 'water', kind: 'point', color: '#24406a' },
  point: { label: 'Point', layer: 'fences', kind: 'point', color: '#6b6552' },
  other: { label: 'Other', layer: 'fences', kind: 'point', color: '#6b6552' },
} as const
export type FeatureType = keyof typeof FEATURE_TYPES

export const LAYERS = [
  { id: 'stock', label: 'Stock', detail: 'Mobs and head counts' },
  { id: 'paddocks', label: 'Paddocks', detail: 'Boundaries and names' },
  { id: 'electric', label: 'Electric fences', detail: 'Coloured by energiser unit' },
  { id: 'fences', label: 'Other fences and gates', detail: 'Fences, gates, yards' },
  { id: 'water', label: 'Troughs, tanks and pipes', detail: 'Water points and lines' },
  { id: 'issues', label: 'Open issues', detail: 'Reported problems' },
  { id: 'sprays', label: 'Spray withholds', detail: 'Paddocks not to graze yet' },
  { id: 'location', label: 'My location', detail: 'Live GPS' },
] as const
export type LayerId = (typeof LAYERS)[number]['id']
export const LATER_LAYERS = [
  { label: 'NDVI (pasture growth)', detail: 'Coming later' },
  { label: 'Elevation and contours', detail: 'Coming later' },
]

const LS_LAYERS = 'fr-map-layers'
export function loadLayers(): Record<LayerId, boolean> {
  const defaults = Object.fromEntries(LAYERS.map((l) => [l.id, l.id !== 'location'])) as Record<LayerId, boolean>
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(LS_LAYERS) ?? '{}') }
  } catch {
    return defaults
  }
}
export function saveLayers(v: Record<LayerId, boolean>) {
  try { localStorage.setItem(LS_LAYERS, JSON.stringify(v)) } catch { /* storage unavailable */ }
}

// Map backgrounds.
//  * With an esriApiKey in config.js (ArcGIS Location Platform, free tier):
//    Esri World Imagery for the whole country, with place names and roads
//    drawn over it. The same key runs Find (see placeSearch.ts).
//  * Without one: Geoscience Australia's National Base Map (whole country,
//    CC BY 4.0) zoomed out, and free state imagery zoomed in (NSW CC BY,
//    Queensland CC BY-SA). A farm can also set imageryUrl / imageryAttribution.
// "Map" is always the Geoscience Australia map (towns, roads, rivers).
export type TileSource = { url: string; attribution: string; minZoom?: number; maxNativeZoom: number; bounds?: [[number, number], [number, number]] }
export type Background = 'imagery' | 'map'
export const IMAGERY_FROM_ZOOM = 11

const GA_BASE: TileSource = {
  url: 'https://services.ga.gov.au/gis/rest/services/NationalBaseMap/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Base map © Geoscience Australia (CC BY 4.0), OpenStreetMap contributors',
  maxNativeZoom: 16,
}
const STATE_IMAGERY: TileSource[] = [
  {
    url: 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery © Spatial Services NSW (DCS)', maxNativeZoom: 20,
    bounds: [[-37.6, 140.9], [-28.1, 153.7]],
  },
  {
    url: 'https://spatial-img.information.qld.gov.au/arcgis/rest/services/Basemaps/LatestStateProgram_AllUsers/ImageServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery © State of Queensland (CC BY-SA)', maxNativeZoom: 20,
    bounds: [[-29.2, 137.9], [-9.0, 153.6]],
  },
]

type MapConfig = { imageryUrl?: string; imageryAttribution?: string; imageryMaxZoom?: number; esriApiKey?: string }
export const esriKey = () => ((loadConfig() ?? {}) as MapConfig).esriApiKey || null

export function backgroundLayers(bg: Background): TileSource[] {
  if (bg === 'map') return [GA_BASE]
  const c = (loadConfig() ?? {}) as MapConfig
  if (c.imageryUrl) {
    return [GA_BASE, { url: c.imageryUrl, attribution: c.imageryAttribution ?? '', maxNativeZoom: c.imageryMaxZoom ?? 20, minZoom: IMAGERY_FROM_ZOOM }]
  }
  if (c.esriApiKey) {
    const esri = (path: string) => `https://ibasemaps-api.arcgis.com/arcgis/rest/services/${path}/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(c.esriApiKey!)}`
    return [
      { url: esri('World_Imagery'), attribution: 'Imagery © Esri, Maxar, Earthstar Geographics', maxNativeZoom: 19 },
      { url: esri('Reference/World_Transportation'), attribution: '', maxNativeZoom: 19 },
      { url: esri('Reference/World_Boundaries_and_Places'), attribution: 'Places © Esri', maxNativeZoom: 19 },
    ]
  }
  return [GA_BASE, ...STATE_IMAGERY.map((s) => ({ ...s, minZoom: IMAGERY_FROM_ZOOM }))]
}

const LS_BG = 'fr-map-background'
export function loadBackground(): Background {
  try { return localStorage.getItem(LS_BG) === 'map' ? 'map' : 'imagery' } catch { return 'imagery' }
}
export function saveBackground(v: Background) {
  try { localStorage.setItem(LS_BG, v) } catch { /* storage unavailable */ }
}
