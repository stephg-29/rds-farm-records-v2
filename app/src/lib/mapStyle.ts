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

// Background imagery. NSW Spatial Services by default (credited on the map);
// a farm in another state sets imageryUrl / imageryAttribution in config.js.
export function imagery(): { url: string; attribution: string; maxNativeZoom: number } {
  const c = loadConfig() as (ReturnType<typeof loadConfig> & { imageryUrl?: string; imageryAttribution?: string; imageryMaxZoom?: number }) | null
  return {
    url: c?.imageryUrl ?? 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: c?.imageryAttribution ?? 'Imagery © Spatial Services NSW (DCS)',
    maxNativeZoom: c?.imageryMaxZoom ?? 20,
  }
}
