// Stock for screens: mobs with head counts and where they are, from the phone's copy.
import { useMemo } from 'react'
import type { Row } from './db'
import { classHeads, currentLocations, daysBetween, mobHeads, todayLocal, type Location, type StockData } from './stock'
import { useTable } from './useSync'

export type MobView = {
  id: string
  row: Row
  name: string
  species: string
  head: number
  location: Location | null
  daysThere: number | null
  classes: { id: string | null; name: string; head: number }[]
}

export type Stock = {
  ready: boolean
  data: StockData
  mobs: MobView[]
  mob: (id: string) => MobView | undefined
  properties: Row[]
  paddocks: Row[]
  classes: Row[]
  paddockName: (paddockId: string | null, propertyId: string) => string
  mobName: (id: string) => string
}

export function useStock(): Stock {
  const mobs = useTable('mobs')
  const events = useTable('stock_events')
  const lines = useTable('stock_event_lines')
  const locations = useTable('mob_location_changes')
  const properties = useTable('properties')
  const paddocks = useTable('paddocks')
  const classes = useTable('livestock_classes')

  return useMemo(() => {
    const data: StockData = { mobs: mobs ?? [], events: events ?? [], lines: lines ?? [], locations: locations ?? [] }
    const heads = mobHeads(data)
    const where = currentLocations(data)
    const today = todayLocal()
    const className = (id: string | null) => (id ? String((classes ?? []).find((c) => c.id === id)?.name ?? 'Unknown class') : 'No class')
    const views: MobView[] = data.mobs.filter((m) => !m.archived_at).map((m) => {
      const id = String(m.id)
      const location = where.get(id) ?? null
      return {
        id, row: m, name: String(m.name), species: String(m.species),
        head: heads.get(id) ?? 0,
        location,
        daysThere: location ? daysBetween(location.since, today) : null,
        classes: [...classHeads(data, id)].filter(([, h]) => h !== 0).map(([cid, h]) => ({ id: cid, name: className(cid), head: h })),
      }
    }).sort((a, b) => a.name.localeCompare(b.name, 'en-AU', { numeric: true }))

    const paddockName = (paddockId: string | null, propertyId: string) => {
      if (paddockId) return String((paddocks ?? []).find((p) => p.id === paddockId)?.name ?? 'Unknown paddock')
      return String((properties ?? []).find((p) => p.id === propertyId)?.name ?? 'Another property')
    }
    return {
      ready: [mobs, events, lines, locations, properties, paddocks, classes].every((x) => x !== undefined),
      data,
      mobs: views,
      mob: (id: string) => views.find((v) => v.id === id),
      properties: (properties ?? []).filter((p) => !p.archived_at),
      paddocks: (paddocks ?? []).filter((p) => !p.archived_at),
      classes: (classes ?? []).filter((c) => !c.archived_at),
      paddockName,
      mobName: (id: string) => String(data.mobs.find((m) => m.id === id)?.name ?? 'Unknown mob'),
    }
  }, [mobs, events, lines, locations, properties, paddocks, classes])
}
