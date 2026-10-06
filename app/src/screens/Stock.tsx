// Stock: the mob list, adding a mob, a mob's page, moving, counting, and
// correcting a history entry.
import { useState, type FormEvent } from 'react'
import { countPlan, mobHistory, movePlan, newMobPlan, openRecounts, todayLocal, type CountOutcome } from '../lib/stock'
import { useStock, type MobView, type Stock } from '../lib/useStock'
import { useSync } from '../lib/useSync'
import { Button, Card, Choice, Empty, Field, Notice, Page, Row as ListRow, Section, go, inputClass, nowIso } from '../ui'
import { Counter, DateField, Discrepancy, PaddockList, SPECIES_LABEL, finalOutcome, fmtDate, outcomeProblem, where, withOtherClass } from './stockParts'

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`

// ---- The list ---------------------------------------------------------------

export function StockList() {
  const stock = useStock()
  const live = stock.mobs.filter((m) => m.head > 0 || !m.location)
  const empty = stock.mobs.filter((m) => m.head <= 0 && m.location)
  const total = live.reduce((n, m) => n + m.head, 0)
  const bySpecies = Object.entries(live.reduce<Record<string, { head: number; mobs: number }>>((acc, m) => {
    acc[m.species] = { head: (acc[m.species]?.head ?? 0) + m.head, mobs: (acc[m.species]?.mobs ?? 0) + 1 }
    return acc
  }, {}))
  const recounts = stock.mobs.filter((m) => openRecounts(stock.data, m.id).length > 0)

  // Group by property, then paddock order.
  const groups = stock.properties.map((p) => ({
    property: p,
    mobs: live.filter((m) => m.location?.propertyId === p.id)
      .sort((a, b) => where(stock, a).localeCompare(where(stock, b), 'en-AU', { numeric: true }) || a.name.localeCompare(b.name)),
  })).filter((g) => g.mobs.length > 0)
  const elsewhere = live.filter((m) => !m.location || !stock.properties.some((p) => p.id === m.location?.propertyId))

  return (
    <Page title="Stock" action={<Button onClick={() => go('/stock/new')} className="shrink-0">Add mob</Button>}>
      {stock.ready && (
        <div className="mt-5 rounded-3xl bg-green px-5 py-5 text-paper">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] opacity-80">On hand</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-5xl">{total.toLocaleString('en-AU')}</span>
            <span className="opacity-80">head</span>
          </div>
          {bySpecies.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {bySpecies.map(([sp, v]) => (
                <span key={sp} className="rounded-xl bg-paper/10 px-3 py-2 text-sm">
                  <b className="font-semibold">{v.head.toLocaleString('en-AU')}</b> {SPECIES_LABEL[sp] ?? sp} · {plural(v.mobs, 'mob', 'mobs')}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {recounts.length > 0 && (
        <div className="mt-4">
          <Notice tone="warn">
            Recount due: {recounts.map((m, i) => (
              <span key={m.id}>{i > 0 && ', '}<button className="font-semibold underline" onClick={() => go(`/stock/${m.id}/count`)}>{m.name}</button></span>
            ))}
          </Notice>
        </div>
      )}

      {stock.ready && stock.mobs.length === 0 && (
        <div className="mt-6"><Empty>No mobs yet. Add your first mob, e.g. Yellow tag heifers, 50 head, in Eastern Rye.</Empty></div>
      )}

      {groups.map(({ property, mobs }) => (
        <Section key={String(property.id)} title={String(property.name)} aside={<span className="text-sm text-muted">{plural(mobs.reduce((n, m) => n + m.head, 0), 'head', 'head')}</span>}>
          <div className="flex flex-col gap-3">
            {byPaddock(mobs).map(([paddockId, here]) => (
              <Card key={paddockId ?? 'none'}>
                <div className="flex min-h-12 items-center gap-3 bg-paper/60 px-4 py-2">
                  <span className="min-w-0 flex-1 text-sm font-semibold text-muted">
                    {stock.paddockName(paddockId, String(property.id))}
                    {here.length > 1 && <span className="font-normal"> · {here.length} mobs, {here.reduce((n, m) => n + m.head, 0)} head</span>}
                  </span>
                  {here.length > 1 && (
                    <button onClick={() => go(groupMovePath(String(property.id), paddockId))}
                      className="h-9 shrink-0 rounded-full bg-green px-4 text-sm font-semibold text-paper">Move all</button>
                  )}
                </div>
                {here.map((m) => <MobRow key={m.id} stock={stock} m={m} showPlace={false} />)}
              </Card>
            ))}
          </div>
        </Section>
      ))}
      {elsewhere.length > 0 && (
        <Section title="Elsewhere"><Card>{elsewhere.map((m) => <MobRow key={m.id} stock={stock} m={m} />)}</Card></Section>
      )}
      {empty.length > 0 && (
        <Section title="No head left">
          <p className="-mt-1 mb-3 text-sm text-muted">Mobs that were sold, split or merged away. Archive them from their page to hide them.</p>
          <Card>{empty.map((m) => <MobRow key={m.id} stock={stock} m={m} />)}</Card>
        </Section>
      )}
    </Page>
  )
}

// Mobs grouped by the paddock they're in, keeping the list's order.
function byPaddock(mobs: MobView[]): [string | null, MobView[]][] {
  const groups = new Map<string | null, MobView[]>()
  for (const m of mobs) {
    const k = m.location?.paddockId ?? null
    groups.set(k, [...(groups.get(k) ?? []), m])
  }
  return [...groups]
}

export const groupMovePath = (propertyId: string, paddockId: string | null) => `/stock/paddock/${propertyId}/${paddockId ?? 'none'}/move`

function MobRow({ stock, m, showPlace = true }: { stock: Stock; m: MobView; showPlace?: boolean }) {
  const classes = m.classes.map((c) => c.name).join(', ')
  return (
    <ListRow onClick={() => go(`/stock/${m.id}`)} label={m.name}
      detail={[showPlace ? where(stock, m) : null, m.daysThere !== null ? `day ${m.daysThere + 1}` : null, classes || null].filter(Boolean).join(' · ')}
      value={<span className="font-display text-xl text-ink">{m.head}</span>} />
  )
}

// ---- Adding a mob ----------------------------------------------------------------

export function NewMob() {
  const stock = useStock()
  const { saveAll } = useSync()
  const [name, setName] = useState('')
  const [species, setSpecies] = useState<'cattle' | 'sheep' | 'goat' | 'other'>('cattle')
  const [classId, setClassId] = useState<string>('')
  const [head, setHead] = useState('')
  const [place, setPlace] = useState<{ propertyId: string; paddockId: string | null } | null>(null)
  const [how, setHow] = useState<'on_hand' | 'purchase' | 'agistment_in'>('on_hand')
  const [date, setDate] = useState(todayLocal())
  const [nvd, setNvd] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const classes = stock.classes.filter((c) => c.species === species).sort((a, b) => Number(a.sort_order) - Number(b.sort_order))

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = name.trim().replace(/\s+/g, ' ')
    const h = parseInt(head, 10)
    if (!n) return setError('Give the mob a name, e.g. Yellow tag heifers.')
    if (stock.mobs.some((m) => m.name.toLowerCase() === n.toLowerCase())) return setError(`There's already a mob called ${n}.`)
    if (!(h > 0)) return setError('How many head?')
    if (!place) return setError('Choose the paddock they are in.')
    setError(null)
    const plan = newMobPlan({ name: n, species, classId: classId || null, head: h, propertyId: place.propertyId, paddockId: place.paddockId, date, how, nvd: nvd.trim(), notes: notes.trim() })
    await saveAll(plan.adds)
    go(`/stock/${plan.mobId}`)
  }

  return (
    <Page title="New mob" kicker="Stock" back="/stock">
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <Field id="name" label="Mob name">
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Yellow tag heifers" className={inputClass} />
        </Field>
        <Field id="species" label="Species">
          <Choice value={species} onChange={(v) => { setSpecies(v); setClassId('') }} options={[
            { value: 'cattle', label: 'Cattle' }, { value: 'sheep', label: 'Sheep' }, { value: 'goat', label: 'Goats' }, { value: 'other', label: 'Other' },
          ]} />
        </Field>
        <div className="flex gap-3">
          <div className="w-28 shrink-0">
            <Field id="head" label="Head">
              <input id="head" inputMode="numeric" value={head} onChange={(e) => setHead(e.target.value.replace(/\D/g, ''))} placeholder="50" className={inputClass} />
            </Field>
          </div>
          <div className="min-w-0 flex-1">
            <Field id="class" label="Class">
              <select id="class" value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
                <option value="">Choose a class</option>
                {classes.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <Field id="how" label="How they got here">
          <Choice value={how} onChange={setHow} options={[
            { value: 'on_hand', label: 'Already here' }, { value: 'purchase', label: 'Bought' }, { value: 'agistment_in', label: 'Agisted in' },
          ]} />
        </Field>
        <p className="-mt-2 text-xs text-muted">
          {how === 'on_hand' ? 'A starting count for stock already on the farm.' : 'Recorded as an arrival, for your LPA movement records.'}
        </p>
        {how !== 'on_hand' && (
          <Field id="nvd" label="NVD or waybill number">
            <input id="nvd" value={nvd} onChange={(e) => setNvd(e.target.value)} className={inputClass} />
          </Field>
        )}
        <DateField value={date} onChange={setDate} />
        <div>
          <div className="mb-2 text-sm font-semibold text-muted">Paddock</div>
          <PaddockList stock={stock} value={place} onChange={setPlace} />
        </div>
        <Field id="notes" label="Notes">
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} h-auto py-3`} />
        </Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button type="submit">Add mob</Button>
      </form>
    </Page>
  )
}

// ---- A mob's page ---------------------------------------------------------------

export function MobScreen({ id }: { id: string }) {
  const stock = useStock()
  const m = stock.mob(id)
  if (!stock.ready) return null
  if (!m) return <Page title="Not found" back="/stock"><p className="mt-4 text-muted">That mob isn't on this phone.</p></Page>
  const history = mobHistory(stock.data, id, { paddock: stock.paddockName, mob: stock.mobName })
  const recounts = openRecounts(stock.data, id)
  const sharing = stock.mobs.filter((x) => x.id !== m.id && x.head > 0 && x.location?.propertyId === m.location?.propertyId && x.location?.paddockId === m.location?.paddockId)
  const classLabel = m.classes.length === 1 ? m.classes[0].name : m.classes.length > 1 ? 'Mixed classes' : null

  return (
    <Page title={m.name} kicker={[SPECIES_LABEL[m.species], classLabel].filter(Boolean).join(' · ')} back="/stock"
      action={<Button kind="secondary" className="shrink-0 px-4" onClick={() => go(`/stock/${id}/edit`)}>Edit</Button>}>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-display text-5xl text-ink">{m.head}</span>
        <span className="text-muted">head · {where(stock, m)}{m.daysThere !== null ? ` · day ${m.daysThere + 1}` : ''}</span>
      </div>
      {m.classes.length > 1 && (
        <p className="mt-1 text-sm text-muted">{m.classes.map((c) => `${c.name} ${c.head}`).join(' · ')}</p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button onClick={() => go(`/stock/${id}/move`)}>Move</Button>
        <Button kind="secondary" onClick={() => go(`/stock/${id}/count`)}>Count</Button>
      </div>
      {m.location && sharing.length > 0 && (
        <button onClick={() => go(groupMovePath(m.location!.propertyId, m.location!.paddockId))}
          className="mt-3 w-full rounded-2xl border border-line bg-card px-4 py-3 text-left text-sm">
          <span className="font-semibold">Move all in {where(stock, m)}</span>
          <span className="block text-muted">With {sharing.map((x) => x.name).join(', ')}</span>
        </button>
      )}
      {recounts.length > 0 && (
        <div className="mt-4">
          <Notice tone="warn">
            Recount due: counted {String(recounts[0].counted_head)} against a book of {String(recounts[0].expected_head)} on {fmtDate(String(recounts[0].event_date))}.{' '}
            <button className="font-semibold underline" onClick={() => go(`/stock/${id}/count`)}>Count now</button>
          </Notice>
        </div>
      )}
      <Section title="History">
        {history.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
          <Card>
            {history.map((h) => (
              <button key={String(h.event.id)} onClick={() => go(`/stock/${id}/record/${h.event.id}`)} className="flex w-full gap-4 px-4 py-3 text-left active:bg-paper">
                <span className="w-14 shrink-0 text-sm text-muted">{fmtDate(h.date)}</span>
                <span className="min-w-0 flex-1 text-sm">{h.text}{h.edited && <span className="text-muted"> · edited</span>}</span>
              </button>
            ))}
          </Card>
        )}
        <p className="mt-2 text-xs text-muted">Tap a record to correct or delete it.</p>
      </Section>
    </Page>
  )
}

// ---- Moving ---------------------------------------------------------------------

export function MoveScreen({ id }: { id: string }) {
  const stock = useStock()
  const m = stock.mob(id)
  if (!stock.ready) return null
  if (!m) return <Page title="Not found" back="/stock"><p className="mt-4 text-muted">That mob isn't on this phone.</p></Page>
  return <MoveForm key={id} stock={stock} m={m} />
}

function MoveForm({ stock, m }: { stock: Stock; m: MobView }) {
  const { saveAll } = useSync()
  const [to, setTo] = useState<{ propertyId: string; paddockId: string | null } | null>(null)
  const [counted, setCounted] = useState(m.head)
  const [outcome, setOutcome] = useState<CountOutcome>({ kind: 'recount_later' })
  const [date, setDate] = useState(todayLocal())
  const [nvd, setNvd] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const crossing = !!to && !!m.location && to.propertyId !== m.location.propertyId
  const toName = to ? stock.paddockName(to.paddockId, to.propertyId) : null
  const sharing = to ? stock.mobs.filter((x) => x.id !== m.id && x.head > 0 && x.location?.propertyId === to.propertyId && x.location.paddockId === to.paddockId) : []

  async function save() {
    if (!to) return setError('Choose where they are going.')
    const problem = outcomeProblem(m.head, counted, outcome)
    if (problem) return setError(problem)
    const o = withOtherClass(stock, finalOutcome(m.head, counted, outcome))
    const plan = movePlan({ mobId: m.id, date, from: m.location, to, book: m.head, counted, outcome: o, nvd: nvd.trim(), notes: notes.trim(), openRecounts: openRecounts(stock.data, m.id) })
    await saveAll(plan.adds, plan.edits)
    go(`/stock/${m.id}`)
  }

  const moving = outcome.kind === 'accept' || counted === m.head ? counted : m.head
  return (
    <Page title={m.name} kicker="Move mob" back={`/stock/${m.id}`}>
      <div className="mt-5 flex items-center gap-3">
        <div className="min-w-0 flex-1 rounded-2xl border border-line bg-card px-4 py-3">
          <div className="text-sm text-muted">From</div>
          <div className="truncate font-semibold">{where(stock, m)}</div>
        </div>
        <span aria-hidden className="text-xl text-muted">→</span>
        <div className={`min-w-0 flex-1 rounded-2xl px-4 py-3 ${to ? 'bg-green text-paper' : 'border border-dashed border-line text-muted'}`}>
          <div className="text-sm opacity-80">To</div>
          <div className="truncate font-semibold">{toName ?? 'Choose below'}</div>
        </div>
      </div>

      <div className="mt-6 mb-2 text-sm font-semibold text-muted">Choose a paddock</div>
      <PaddockList stock={stock} value={to} onChange={(v) => { setTo(v); setError(null) }} exclude={m.location} mobId={m.id} />
      {sharing.length > 0 && (
        <div className="mt-3"><Notice tone="info">{m.name} will share {toName} with {sharing.map((x) => x.name).join(', ')}, kept as separate mobs.</Notice></div>
      )}

      <h2 className="mt-8 mb-3 text-xl text-green-deep">Count through the gate</h2>
      <Counter book={m.head} value={counted} onChange={setCounted} />
      <Discrepancy stock={stock} mob={m} book={m.head} counted={counted} outcome={outcome} onChange={setOutcome} />

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
        <Button onClick={save} disabled={!to}>{to ? `Move ${moving} head to ${toName}` : 'Choose a paddock'}</Button>
      </div>
    </Page>
  )
}

// ---- Counting ---------------------------------------------------------------------

export function CountScreen({ id }: { id: string }) {
  const stock = useStock()
  const m = stock.mob(id)
  if (!stock.ready) return null
  if (!m) return <Page title="Not found" back="/stock"><p className="mt-4 text-muted">That mob isn't on this phone.</p></Page>
  return <CountForm key={id} stock={stock} m={m} />
}

function CountForm({ stock, m }: { stock: Stock; m: MobView }) {
  const { saveAll } = useSync()
  const [counted, setCounted] = useState(m.head)
  const [outcome, setOutcome] = useState<CountOutcome>({ kind: 'recount_later' })
  const [date, setDate] = useState(todayLocal())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recounts = openRecounts(stock.data, m.id)

  async function save() {
    const problem = outcomeProblem(m.head, counted, outcome)
    if (problem) return setError(problem)
    const o = withOtherClass(stock, finalOutcome(m.head, counted, outcome))
    const plan = countPlan({ mobId: m.id, date, book: m.head, counted, outcome: o, notes: notes.trim(), openRecounts: recounts })
    await saveAll(plan.adds, plan.edits)
    go(`/stock/${m.id}`)
  }

  return (
    <Page title={m.name} kicker="Count" back={`/stock/${m.id}`}>
      <p className="mt-3 text-muted">{where(stock, m)}. A count is recorded even when it matches the book.</p>
      {recounts.length > 0 && <div className="mt-4"><Notice tone="info">This count also closes the recount from {fmtDate(String(recounts[0].event_date))}.</Notice></div>}
      <div className="mt-6"><Counter book={m.head} value={counted} onChange={setCounted} /></div>
      <Discrepancy stock={stock} mob={m} book={m.head} counted={counted} outcome={outcome} onChange={setOutcome} />
      <div className="mt-6 flex flex-col gap-4">
        <DateField value={date} onChange={setDate} />
        <Field id="notes" label="Notes">
          <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save}>Save count of {counted}</Button>
      </div>
    </Page>
  )
}

// ---- Editing a mob ----------------------------------------------------------------

export function EditMob({ id }: { id: string }) {
  const stock = useStock()
  const m = stock.mob(id)
  if (!stock.ready) return null
  if (!m) return <Page title="Not found" back="/stock"><p className="mt-4 text-muted">That mob isn't on this phone.</p></Page>
  return <EditMobForm key={id} stock={stock} m={m} />
}

function EditMobForm({ stock, m }: { stock: Stock; m: MobView }) {
  const { edit } = useSync()
  const [name, setName] = useState(m.name)
  const [notes, setNotes] = useState(String(m.row.notes ?? ''))
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = name.trim().replace(/\s+/g, ' ')
    if (!n) return setError('Give the mob a name.')
    if (stock.mobs.some((x) => x.id !== m.id && x.name.toLowerCase() === n.toLowerCase())) return setError(`There's already a mob called ${n}.`)
    await edit('mobs', m.id, { name: n, notes: notes.trim() || null })
    go(`/stock/${m.id}`)
  }

  return (
    <Page title={`Edit ${m.name}`} kicker="Mob" back={`/stock/${m.id}`}>
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <Field id="name" label="Mob name">
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field id="notes" label="Notes">
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputClass} h-auto py-3`} />
        </Field>
        <p className="text-sm text-muted">The head count and paddock come from the records. To change them, use Move or Count, or correct a record in the history.</p>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button type="submit">Save</Button>
      </form>
      <div className="mt-10">
        <Button kind="danger" className="w-full" onClick={() => { edit('mobs', m.id, { archived_at: nowIso() }); go('/stock') }}>Archive mob</Button>
        <p className="mt-2 text-center text-xs text-muted">
          {m.head > 0 ? `It still has ${m.head} head on the books. ` : ''}Archiving hides it from the list. Its history is kept.
        </p>
      </div>
    </Page>
  )
}

// ---- Correcting a history record ----------------------------------------------------

export function RecordScreen({ mobId, eventId }: { mobId: string; eventId: string }) {
  const stock = useStock()
  if (!stock.ready) return null
  const event = stock.data.events.find((e) => e.id === eventId)
  const item = mobHistory(stock.data, mobId, { paddock: stock.paddockName, mob: stock.mobName }).find((h) => h.event.id === eventId)
  if (!event || !item) return <Page title="Not found" back={`/stock/${mobId}`}><p className="mt-4 text-muted">That record has been deleted or isn't on this phone.</p></Page>
  return <RecordForm key={eventId} stock={stock} mobId={mobId} event={event} text={item.text} />
}

function RecordForm({ stock, mobId, event, text }: { stock: Stock; mobId: string; event: Record<string, unknown>; text: string }) {
  const { edit, saveAll } = useSync()
  const [date, setDate] = useState(String(event.event_date))
  const [notes, setNotes] = useState(String(event.notes ?? ''))
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const linked = stock.data.events.filter((e) => e.related_event_id === event.id && !e.deleted_at)
  const back = `/stock/${mobId}`

  async function save(e: FormEvent) {
    e.preventDefault()
    await edit('stock_events', String(event.id), { event_date: date, notes: notes.trim() || null }, reason.trim() || undefined)
    // Keep a linked adjustment on the same date as its move or count.
    for (const l of linked) await edit('stock_events', String(l.id), { event_date: date })
    go(back)
  }

  async function remove() {
    const r = reason.trim() || undefined
    await saveAll([], [event, ...linked].map((x) => ({ table: 'stock_events', id: String(x.id), changes: { deleted_at: nowIso() }, reason: r })))
    go(back)
  }

  return (
    <Page title="Correct a record" kicker={stock.mobName(mobId)} back={back}>
      <div className="mt-5 rounded-2xl border border-line bg-card px-4 py-4">
        <div className="text-sm text-muted">{fmtDate(String(event.event_date), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
        <div className="mt-1">{text}</div>
      </div>
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <DateField value={date} onChange={setDate} />
        <Field id="notes" label="Notes">
          <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </Field>
        <Field id="reason" label="Reason for the change (optional)" hint="Kept in the record's history, with who changed it and when.">
          <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="e.g. Wrong day" />
        </Field>
        <Button type="submit">Save changes</Button>
      </form>
      <div className="mt-10">
        {confirm ? (
          <div className="rounded-2xl border border-alert/30 bg-alert-soft p-4">
            <p className="text-sm text-alert-ink">
              Delete this record{linked.length > 0 ? ` and the ${linked.length === 1 ? 'adjustment' : `${linked.length} adjustments`} recorded with it` : ''}?
              Head counts and paddocks will be worked out without it. It stays in the change history.
            </p>
            <div className="mt-3 flex gap-2">
              <Button kind="danger" className="flex-1" onClick={remove}>Delete</Button>
              <Button kind="secondary" onClick={() => setConfirm(false)}>Keep</Button>
            </div>
          </div>
        ) : (
          <Button kind="danger" className="w-full" onClick={() => setConfirm(true)}>Delete this record</Button>
        )}
      </div>
    </Page>
  )
}
