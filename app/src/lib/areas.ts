// The app's areas and the three sections they live in (Stock, Paddocks,
// More). Section pages show their areas as tiles; the bottom bar holds Home,
// three areas each person picks (Map, Stock and Paddocks to start), and More;
// every screen's bottom strip goes Back and to its section.

export type SectionKey = 'stock' | 'paddocks' | 'more'
export type Area = {
  key: string
  label: string
  detail: string
  path: string
  section: SectionKey | null
  // The farm module that switches it on (null: always on).
  module: string | null
  icon: string
}

export const SECTIONS: Record<SectionKey, { label: string; path: string }> = {
  stock: { label: 'Stock', path: '/stock' },
  paddocks: { label: 'Paddocks', path: '/paddocks' },
  more: { label: 'More', path: '/more' },
}

const I = {
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  stock: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 19c.5-3 2.8-5 5.5-5s5 2 5.5 5zm11.4-4.6c.6-.3 1.3-.4 2.1-.4 2.7 0 5 2 5.5 5h-6',
  paddocks: 'M3 5h18v14H3zM3 12h18M12 5v14',
  treat: 'M14.5 4.5l5 5M17 2l5 5-9.5 9.5-5-5zM7.5 16.5 3 21M10 14l-2.5 2.5',
  chem: 'M9 3h6M10 3v5L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-10V3M7.5 14h9',
  feed: 'M4 20h16M6 20V10l6-5 6 5v10M9 20v-6h6v6',
  breeding: 'M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z',
  spray: 'M4 10h8l2 3H4zM12 10V6h3M18 6l2-1M18 9h3M18 12l2 1M6 13v6h4v-6',
  pasture: 'M12 21V11M12 11c0-4 3-7 7-7 0 4-3 7-7 7zM12 14c0-3-2.5-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5z',
  issue: 'M12 3 2 20h20zM12 10v4M12 17v.5',
  jobs: 'M9 5h6M9 3h6v4H9zM5 5h4M15 5h4v16H5V5M8 12l2.5 2.5L16 9',
  rain: 'M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 6.5 4 4 0 0 1 17 15zM8 18l-1 2M12 18l-1 2M16 18l-1 2',
  vehicle: 'M3 15V9h11v6M14 11h4l3 3v1h-7M6.5 18a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zm11 0a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z',
  docs: 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4',
  reports: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
}

export const AREAS: Area[] = [
  { key: 'map', label: 'Map', detail: 'Paddocks, mobs, fences, water', path: '/map', section: null, module: null, icon: I.map },
  { key: 'stock', label: 'Stock', detail: 'Mobs and head counts', path: '/stock', section: null, module: null, icon: I.stock },
  { key: 'paddocks', label: 'Paddocks', detail: 'Spray, pasture, issues, rain', path: '/paddocks', section: null, module: null, icon: I.paddocks },
  // Stock
  { key: 'treatments', label: 'Treatments', detail: 'WHP and ESI', path: '/records/treatments', section: 'stock', module: 'treatments', icon: I.treat },
  { key: 'chemicals', label: 'Chemicals', detail: 'On hand, batches, expiry', path: '/records/chemicals', section: 'stock', module: 'chemical_inventory', icon: I.chem },
  { key: 'feed', label: 'Feed', detail: 'Sheds, rations, feeding', path: '/records/feed', section: 'stock', module: 'feed', icon: I.feed },
  { key: 'breeding', label: 'Breeding', detail: 'Joining, preg testing, marking', path: '/records/breeding', section: 'stock', module: 'breeding', icon: I.breeding },
  // Paddocks
  { key: 'properties', label: 'Paddocks', detail: 'Properties and paddock details', path: '/setup/properties', section: 'paddocks', module: null, icon: I.paddocks },
  { key: 'spray', label: 'Spray', detail: 'Spraying and grazing withholds', path: '/records/spray', section: 'paddocks', module: 'spray', icon: I.spray },
  { key: 'pasture', label: 'Pasture', detail: 'Fertiliser and sowing', path: '/records/pasture', section: 'paddocks', module: 'pasture', icon: I.pasture },
  { key: 'issues', label: 'Issues', detail: 'Problems reported', path: '/issues', section: 'paddocks', module: 'issues', icon: I.issue },
  { key: 'jobs', label: 'Contractor jobs', detail: 'Spray and fertiliser jobs', path: '/jobs', section: 'paddocks', module: 'contractor_jobs', icon: I.jobs },
  { key: 'rainfall', label: 'Rainfall', detail: 'Rain gauge readings', path: '/records/rainfall', section: 'paddocks', module: 'rainfall', icon: I.rain },
  // More
  { key: 'vehicles', label: 'Vehicles', detail: 'Services and repairs', path: '/records/vehicles', section: 'more', module: 'vehicles', icon: I.vehicle },
  { key: 'documents', label: 'Documents', detail: 'Plans and reviews', path: '/records/documents', section: 'more', module: 'documents', icon: I.docs },
  { key: 'reports', label: 'Reports', detail: 'Reconciliation, LPA audit pack', path: '/records/reports', section: 'more', module: null, icon: I.reports },
]

export const areaByKey = (key: string) => AREAS.find((a) => a.key === key)

// The bottom bar's three middle slots, until a person picks their own.
export const DEFAULT_NAV = ['map', 'stock', 'paddocks']

// Which section a screen belongs to (for the strip at the bottom).
export function sectionOf(route: string[]): SectionKey | null {
  const [a, b] = route
  if (a === 'stock') return 'stock'
  if (a === 'paddocks' || a === 'issues' || a === 'jobs') return 'paddocks'
  if (a === 'setup' && (b === 'properties' || b === 'paddocks')) return 'paddocks'
  if (a === 'records' && b) return AREAS.find((x) => x.path === `/records/${b}`)?.section ?? 'more'
  if (a === 'records' || a === 'more' || a === 'setup' || a === 'sync' || a === 'alerts') return 'more'
  return null
}

// Is this screen the given area (for highlighting its tab)?
export function isInArea(area: Area, route: string[]): boolean {
  const parts = area.path.split('/').filter(Boolean)
  if (area.key === 'stock') return route[0] === 'stock'
  if (area.key === 'paddocks') return sectionOf(route) === 'paddocks' && route[0] !== 'map'
  return parts.every((p, i) => route[i] === p)
}
