// Shared parts for paddock records (spray, pasture, fertiliser).
import type { Row } from '../lib/db'
import type { Coverage } from '../lib/land'
import { Card } from '../ui'

const REASONS = ['Rain', 'Wind', 'Ran out', 'Too wet to get in', 'Other']

// Tick several paddocks of one property. limitTo: only these (a contractor's job).
// With onCoverage, each ticked paddock can be marked as only part done.
export function PaddockMultiPick({ paddocks, propertyId, value, onChange, limitTo, stockIn, coverage, onCoverage, verb = 'done' }: {
  paddocks: Row[]
  propertyId: string
  value: string[]
  onChange: (v: string[]) => void
  limitTo?: string[]
  stockIn?: (paddockId: string) => string | null
  coverage?: Record<string, Coverage>
  onCoverage?: (c: Record<string, Coverage>) => void
  verb?: string
}) {
  const list = paddocks
    .filter((d) => d.property_id === propertyId && !d.archived_at && (!limitTo || limitTo.includes(String(d.id))))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'en-AU', { numeric: true }))
  if (list.length === 0) return <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-muted">No paddocks on this property yet.</p>
  const all = list.every((d) => value.includes(String(d.id)))
  const set = (pid: string, c: Partial<Coverage>) => onCoverage?.({ ...coverage, [pid]: { part: false, areaHa: null, reason: '', ...coverage?.[pid], ...c } })
  return (
    <Card>
      {list.length > 3 && (
        <label className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm font-semibold text-muted">
          <input type="checkbox" checked={all} onChange={() => onChange(all ? [] : list.map((d) => String(d.id)))} className="size-5 accent-green" /> All paddocks
        </label>
      )}
      {list.map((d) => {
        const pid = String(d.id)
        const on = value.includes(pid)
        const note = stockIn?.(pid)
        const c = coverage?.[pid]
        return (
          <div key={pid} className="px-4 py-2">
            <label className="flex min-h-10 items-center gap-3">
              <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== pid) : [...value, pid])} className="size-5 accent-green" />
              <span className="flex-1">{String(d.name)}</span>
              {d.area_ha ? <span className="text-sm text-muted">{Number(d.area_ha).toLocaleString('en-AU')} ha</span> : null}
              {note && <span className="text-xs font-semibold text-alert">{note}</span>}
            </label>
            {on && onCoverage && (
              <div className="mt-1 mb-1 ml-8 flex flex-col gap-2">
                <div className="flex gap-1 text-sm" role="radiogroup" aria-label={`How much of ${String(d.name)}`}>
                  {[false, true].map((part) => (
                    <button key={String(part)} type="button" role="radio" aria-checked={!!c?.part === part} onClick={() => set(pid, { part })}
                      className={`rounded-full border px-3 py-1 font-semibold ${!!c?.part === part ? (part ? 'border-amber bg-amber-soft' : 'border-green bg-green text-paper') : 'border-line'}`}>
                      {part ? 'Part' : 'All of it'}
                    </button>
                  ))}
                </div>
                {c?.part && (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <input aria-label={`Hectares ${verb} in ${String(d.name)}`} inputMode="decimal" value={c.areaHa ?? ''} onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); set(pid, { areaHa: e.target.value.trim() === '' || Number.isNaN(n) ? null : n }) }}
                        className="h-10 w-20 rounded-lg border border-line bg-card px-2" placeholder="ha" />
                      <span className="text-muted">ha {verb}{d.area_ha ? ` of ${Number(d.area_ha)}` : ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {REASONS.map((r) => (
                        <button key={r} type="button" onClick={() => set(pid, { reason: r })} aria-pressed={c.reason === r}
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${c.reason === r ? 'border-green bg-green text-paper' : 'border-line'}`}>{r}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </Card>
  )
}

// Coverage as saved on a record's paddock links.
export function coverageFrom(links: Row[]): Record<string, Coverage> {
  return Object.fromEntries(links.filter((l) => !l.deleted_at && l.coverage === 'part').map((l) => [String(l.paddock_id), { part: true, areaHa: l.area_done_ha == null ? null : Number(l.area_done_ha), reason: String(l.part_reason ?? '') }]))
}

export const areaOf = (paddocks: Row[], ids: string[]) =>
  Math.round(paddocks.filter((d) => ids.includes(String(d.id))).reduce((n, d) => n + Number(d.area_ha ?? 0), 0) * 10) / 10
