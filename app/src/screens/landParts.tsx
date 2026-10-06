// Shared parts for paddock records (spray, pasture, fertiliser).
import type { Row } from '../lib/db'
import { Card } from '../ui'

// Tick several paddocks of one property. limitTo: only these (a contractor's job).
export function PaddockMultiPick({ paddocks, propertyId, value, onChange, limitTo, stockIn }: {
  paddocks: Row[]
  propertyId: string
  value: string[]
  onChange: (v: string[]) => void
  limitTo?: string[]
  stockIn?: (paddockId: string) => string | null
}) {
  const list = paddocks
    .filter((d) => d.property_id === propertyId && !d.archived_at && (!limitTo || limitTo.includes(String(d.id))))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'en-AU', { numeric: true }))
  if (list.length === 0) return <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-muted">No paddocks on this property yet.</p>
  const all = list.every((d) => value.includes(String(d.id)))
  return (
    <Card>
      {list.length > 3 && (
        <label className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm font-semibold text-muted">
          <input type="checkbox" checked={all} onChange={() => onChange(all ? [] : list.map((d) => String(d.id)))} className="size-5 accent-green" /> All paddocks
        </label>
      )}
      {list.map((d) => {
        const on = value.includes(String(d.id))
        const note = stockIn?.(String(d.id))
        return (
          <label key={String(d.id)} className="flex min-h-12 items-center gap-3 px-4 py-2">
            <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== d.id) : [...value, String(d.id)])} className="size-5 accent-green" />
            <span className="flex-1">{String(d.name)}</span>
            {d.area_ha ? <span className="text-sm text-muted">{Number(d.area_ha).toLocaleString('en-AU')} ha</span> : null}
            {note && <span className="text-xs font-semibold text-alert">{note}</span>}
          </label>
        )
      })}
    </Card>
  )
}

export const areaOf = (paddocks: Row[], ids: string[]) =>
  Math.round(paddocks.filter((d) => ids.includes(String(d.id))).reduce((n, d) => n + Number(d.area_ha ?? 0), 0) * 10) / 10
