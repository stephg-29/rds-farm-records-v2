// Pieces shared by the stock screens.
import { useState } from 'react'
import type { Row } from '../lib/db'
import { ADJUST_REASONS, todayLocal, type AdjustReason, type CountOutcome } from '../lib/stock'
import type { MobView, Stock } from '../lib/useStock'
import { Field, inputClass } from '../ui'

export const SPECIES_LABEL: Record<string, string> = { cattle: 'Cattle', sheep: 'Sheep', goat: 'Goats', other: 'Other' }

export function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', opts)
}

export function where(stock: Stock, m: MobView) {
  if (!m.location) return 'No paddock yet'
  return stock.paddockName(m.location.paddockId, m.location.propertyId)
}

export function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = todayLocal()
  return (
    <Field id="date" label="Date" hint={value === today ? 'Today' : value > today ? 'That date is in the future.' : undefined}>
      <input id="date" type="date" value={value} max={today} onChange={(e) => onChange(e.target.value || today)} className={inputClass} />
    </Field>
  )
}

// Paddocks to choose from, grouped by property, with the mobs already there.
export function PaddockList({ stock, value, onChange, exclude, mobId, hideMobs = [] }: {
  stock: Stock
  value: { propertyId: string; paddockId: string | null } | null
  onChange: (v: { propertyId: string; paddockId: string | null }) => void
  exclude?: { propertyId: string; paddockId: string | null } | null
  mobId?: string
  // Mobs not to list as "with ..." (the ones being moved).
  hideMobs?: string[]
}) {
  const byName = (a: Row, b: Row) => String(a.name).localeCompare(String(b.name), 'en-AU', { numeric: true })
  const others = (propertyId: string, paddockId: string | null) =>
    stock.mobs.filter((m) => m.id !== mobId && !hideMobs.includes(m.id) && m.location?.propertyId === propertyId && m.location.paddockId === paddockId && m.head > 0)

  if (!stock.ready) return null
  if (stock.properties.length === 0) {
    return <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Add a property and its paddocks in Setup first.</p>
  }
  return (
    <div className="flex flex-col gap-4">
      {[...stock.properties].sort(byName).map((p) => {
        const pads = stock.paddocks.filter((d) => d.property_id === p.id).sort(byName)
        const options: { paddockId: string | null; name: string; area: unknown }[] = pads.length > 0
          ? pads.map((d) => ({ paddockId: String(d.id), name: String(d.name), area: d.area_ha }))
          : [{ paddockId: null, name: String(p.name), area: null }]
        return (
          <div key={String(p.id)}>
            {stock.properties.length > 1 && (
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{String(p.name)}{p.pic ? ` · ${p.pic}` : ''}</div>
            )}
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {options.map((o) => {
                const isHere = !!exclude && exclude.propertyId === p.id && exclude.paddockId === o.paddockId
                const chosen = !!value && value.propertyId === p.id && value.paddockId === o.paddockId
                const there = others(String(p.id), o.paddockId)
                const detail = [
                  o.area ? `${Number(o.area).toLocaleString('en-AU')} ha` : null,
                  there.length > 0 ? `with ${there.map((m) => `${m.name} (${m.head})`).join(', ')}` : null,
                  isHere ? 'here now' : null,
                ].filter(Boolean).join(' · ')
                return (
                  <button key={o.paddockId ?? 'none'} type="button" disabled={isHere} onClick={() => onChange({ propertyId: String(p.id), paddockId: o.paddockId })}
                    aria-pressed={chosen}
                    className={`flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-40 ${chosen ? 'bg-clear' : ''}`}>
                    <span className="min-w-0 flex-1">
                      <span className={`block ${chosen ? 'font-semibold' : ''}`}>{o.name}</span>
                      {detail && <span className="mt-0.5 block text-sm text-muted">{detail}</span>}
                    </span>
                    {chosen && <span aria-hidden className="text-lg text-green">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Book count beside a counter that starts at the book count.
export function Counter({ book, value, onChange, label = 'Counted' }: { book: number; value: number; onChange: (n: number) => void; label?: string }) {
  const [text, setText] = useState(String(value))
  const set = (n: number) => { const v = Math.max(0, n); setText(String(v)); onChange(v) }
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-4">
      <div className="flex-1">
        <div className="text-sm text-muted">Book count</div>
        <div className="font-display text-3xl text-muted">{book}</div>
      </div>
      <button type="button" aria-label="One less" onClick={() => set(value - 1)} className="size-12 shrink-0 rounded-full border border-line bg-paper text-2xl">−</button>
      <div className="w-20 text-center">
        <label htmlFor="counted" className="text-sm font-semibold text-muted">{label}</label>
        <input id="counted" inputMode="numeric" value={text}
          onChange={(e) => { setText(e.target.value); const n = parseInt(e.target.value, 10); if (!Number.isNaN(n) && n >= 0) onChange(n) }}
          onBlur={() => setText(String(value))}
          className="w-full bg-transparent text-center font-display text-4xl outline-none" />
      </div>
      <button type="button" aria-label="One more" onClick={() => set(value + 1)} className="size-12 shrink-0 rounded-full border border-line bg-paper text-2xl">+</button>
    </div>
  )
}

// When the count and the book differ: recount later, or accept and say why.
export function Discrepancy({ stock, mob, book, counted, outcome, onChange }: {
  stock: Stock
  mob: MobView
  book: number
  counted: number
  outcome: CountOutcome
  onChange: (o: CountOutcome) => void
}) {
  const diff = counted - book
  if (diff === 0) return null
  const accepting = outcome.kind === 'accept'
  const reason: AdjustReason = accepting ? outcome.reason : diff < 0 ? 'missing' : 'strays_extra'
  const mainClass = [...mob.classes].sort((a, b) => b.head - a.head)[0]?.id ?? null
  const accept = (changes: Partial<Extract<CountOutcome, { kind: 'accept' }>>) =>
    onChange({ kind: 'accept', reason, classId: accepting ? outcome.classId : mainClass, otherMobId: accepting ? outcome.otherMobId : null, ...changes })
  const reasons = ADJUST_REASONS.filter((r) => !(r.value === 'dead_found' && diff > 0))
  const otherMobs = stock.mobs.filter((m) => m.id !== mob.id && m.species === mob.species)

  return (
    <div className="mt-4 rounded-2xl border border-amber/40 bg-amber-soft p-4">
      <div className="font-semibold text-ink">{Math.abs(diff)} head {diff < 0 ? 'short of' : 'over'} the book</div>
      <div className="mt-3 flex flex-col gap-2">
        <Option chosen={outcome.kind !== 'accept'} onClick={() => onChange({ kind: 'recount_later' })}
          title="Recount later" detail={`Keep ${book} and add a reminder`} />
        <Option chosen={accepting} onClick={() => accept({})}
          title={`Accept ${counted}`} detail="Record why: dead, missing, boxed with another mob" />
      </div>
      {accepting && (
        <div className="mt-3 flex flex-col gap-3">
          <Field id="reason" label="Why">
            <select id="reason" value={reason} onChange={(e) => accept({ reason: e.target.value as AdjustReason })} className={inputClass}>
              {reasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
          {reason === 'boxed_with_other_mob' && (
            <Field id="other" label={diff < 0 ? 'Which mob are they with?' : 'Which mob did they come from?'}>
              <select id="other" value={outcome.otherMobId ?? ''} onChange={(e) => accept({ otherMobId: e.target.value || null })} className={inputClass}>
                <option value="">Choose a mob</option>
                {otherMobs.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.head})</option>)}
              </select>
            </Field>
          )}
          {mob.classes.length > 1 && (
            <Field id="class" label="Which class?">
              <select id="class" value={outcome.classId ?? ''} onChange={(e) => accept({ classId: e.target.value || null })} className={inputClass}>
                {mob.classes.map((c) => <option key={c.id ?? 'none'} value={c.id ?? ''}>{c.name} ({c.head})</option>)}
              </select>
            </Field>
          )}
        </div>
      )}
    </div>
  )
}

function Option({ chosen, onClick, title, detail }: { chosen: boolean; onClick: () => void; title: string; detail: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={chosen}
      className={`flex items-center gap-3 rounded-xl border-2 bg-card px-4 py-3 text-left ${chosen ? 'border-green' : 'border-line'}`}>
      <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${chosen ? 'border-green' : 'border-line'}`}>
        {chosen && <span className="size-3 rounded-full bg-green" />}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{detail}</span>
      </span>
    </button>
  )
}

// Is the chosen outcome complete enough to save?
export function outcomeProblem(book: number, counted: number, o: CountOutcome): string | null {
  if (book === counted) return null
  if (o.kind === 'accept' && o.reason === 'boxed_with_other_mob' && !o.otherMobId) return 'Choose which mob they were boxed with.'
  return null
}

// The outcome to save, given the count.
export function finalOutcome(book: number, counted: number, o: CountOutcome): CountOutcome {
  return book === counted ? { kind: 'match' } : o.kind === 'match' ? { kind: 'recount_later' } : o
}

// For "boxed with another mob", the other mob's line uses that mob's main class.
export function withOtherClass(stock: Stock, o: CountOutcome): CountOutcome {
  if (o.kind !== 'accept' || !o.otherMobId) return o
  const other = stock.mob(o.otherMobId)
  const main = other ? [...other.classes].sort((a, b) => b.head - a.head)[0]?.id ?? null : null
  return { ...o, otherClassId: main }
}

