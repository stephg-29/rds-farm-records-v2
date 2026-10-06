// Move several mobs out of one paddock together. Each mob keeps its own
// count and history; it's one screen and one save.
import { useState } from 'react'
import { groupMovePlan, openRecounts, todayLocal, type CountOutcome } from '../lib/stock'
import { useStock, type MobView, type Stock } from '../lib/useStock'
import { useSync } from '../lib/useSync'
import { Button, Field, Notice, Page, go, inputClass } from '../ui'
import { DateField, Discrepancy, PaddockList, finalOutcome, outcomeProblem, withOtherClass } from './stockParts'

export function GroupMoveScreen({ propertyId, paddockId }: { propertyId: string; paddockId: string | null }) {
  const stock = useStock()
  if (!stock.ready) return null
  const here = stock.mobs.filter((m) => m.head > 0 && m.location?.propertyId === propertyId && m.location.paddockId === paddockId)
  if (here.length === 0) {
    return <Page title="Nothing to move" back="/stock"><p className="mt-4 text-muted">There are no mobs in that paddock now.</p></Page>
  }
  return <GroupMoveForm key={`${propertyId}:${paddockId}`} stock={stock} here={here} from={{ propertyId, paddockId }} />
}

type MobState = { going: boolean; counted: number; outcome: CountOutcome }

function GroupMoveForm({ stock, here, from }: { stock: Stock; here: MobView[]; from: { propertyId: string; paddockId: string | null } }) {
  const { saveAll } = useSync()
  const [state, setState] = useState<Record<string, MobState>>(() =>
    Object.fromEntries(here.map((m) => [m.id, { going: true, counted: m.head, outcome: { kind: 'recount_later' } as CountOutcome }])))
  const [to, setTo] = useState<{ propertyId: string; paddockId: string | null } | null>(null)
  const [date, setDate] = useState(todayLocal())
  const [nvd, setNvd] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fromName = stock.paddockName(from.paddockId, from.propertyId)
  const toName = to ? stock.paddockName(to.paddockId, to.propertyId) : null
  const going = here.filter((m) => state[m.id].going)
  const update = (id: string, changes: Partial<MobState>) => setState((s) => ({ ...s, [id]: { ...s[id], ...changes } }))
  const crossing = !!to && to.propertyId !== from.propertyId
  const headMoving = going.reduce((n, m) => {
    const st = state[m.id]
    return n + (st.outcome.kind === 'accept' || st.counted === m.head ? st.counted : m.head)
  }, 0)

  async function save() {
    if (going.length === 0) return setError('Tick at least one mob.')
    if (!to) return setError('Choose where they are going.')
    for (const m of going) {
      const problem = outcomeProblem(m.head, state[m.id].counted, state[m.id].outcome)
      if (problem) return setError(`${m.name}: ${problem}`)
    }
    const plan = groupMovePlan({
      date, to, nvd: nvd.trim(), notes: notes.trim(),
      mobs: going.map((m) => ({
        mobId: m.id, from: m.location, book: m.head, counted: state[m.id].counted,
        outcome: withOtherClass(stock, finalOutcome(m.head, state[m.id].counted, state[m.id].outcome)),
        openRecounts: openRecounts(stock.data, m.id),
      })),
    })
    await saveAll(plan.adds, plan.edits)
    go('/stock')
  }

  return (
    <Page title={`Move all in ${fromName}`} kicker="Move mobs" back="/stock">
      <p className="mt-3 text-muted">Untick any mob staying behind. Each mob keeps its own count and history.</p>

      <div className="mt-5 flex flex-col gap-3">
        {here.map((m) => {
          const st = state[m.id]
          return (
            <div key={m.id} className={`rounded-2xl border bg-card p-4 ${st.going ? 'border-line' : 'border-dashed border-line opacity-60'}`}>
              <div className="flex items-center gap-3">
                <input type="checkbox" id={`go-${m.id}`} checked={st.going} onChange={(e) => update(m.id, { going: e.target.checked })}
                  className="size-6 shrink-0 accent-green" />
                <label htmlFor={`go-${m.id}`} className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{m.name}</span>
                  <span className="block text-sm text-muted">Book {m.head}{st.going ? '' : ' · staying'}</span>
                </label>
                {st.going && <MiniCounter name={m.name} value={st.counted} onChange={(n) => update(m.id, { counted: n })} />}
              </div>
              {st.going && (
                <Discrepancy stock={stock} mob={m} book={m.head} counted={st.counted} outcome={st.outcome} onChange={(o) => update(m.id, { outcome: o })} />
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-8 mb-2 text-sm font-semibold text-muted">Moving to</div>
      <PaddockList stock={stock} value={to} onChange={(v) => { setTo(v); setError(null) }} exclude={from} hideMobs={going.map((m) => m.id)} />

      <div className="mt-6 flex flex-col gap-4">
        {crossing && (
          <Field id="nvd" label="NVD or waybill number" hint="Moving to another property (different PIC) needs an NVD.">
            <input id="nvd" value={nvd} onChange={(e) => setNvd(e.target.value)} className={inputClass} />
          </Field>
        )}
        <DateField value={date} onChange={setDate} />
        <Field id="notes" label="Notes">
          <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save} disabled={!to || going.length === 0}>
          {!to ? 'Choose a paddock' : going.length === 0 ? 'Tick a mob' : `Move ${going.length} ${going.length === 1 ? 'mob' : 'mobs'} (${headMoving} head) to ${toName}`}
        </Button>
      </div>
    </Page>
  )
}

// A small counter for one mob in a list: − count +, starting at the book.
function MiniCounter({ name, value, onChange }: { name: string; value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  const set = (n: number) => { const v = Math.max(0, n); setText(String(v)); onChange(v) }
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" aria-label={`One less ${name}`} onClick={() => set(value - 1)} className="size-10 rounded-full border border-line bg-paper text-xl">−</button>
      <input aria-label={`${name} counted`} inputMode="numeric" value={text}
        onChange={(e) => { setText(e.target.value); const n = parseInt(e.target.value, 10); if (!Number.isNaN(n) && n >= 0) onChange(n) }}
        onBlur={() => setText(String(value))}
        className="w-14 bg-transparent text-center font-display text-2xl outline-none" />
      <button type="button" aria-label={`One more ${name}`} onClick={() => set(value + 1)} className="size-10 rounded-full border border-line bg-paper text-xl">+</button>
    </div>
  )
}
