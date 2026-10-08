// Stock: the mob list, adding a mob, a mob's page, moving, counting, and
// correcting a history entry.
import { useState, type FormEvent } from 'react'
import { NLIS_STATUS, countPlan, daysBetween, mergePlan, mobHistory, movePlan, newMobPlan, openRecounts, todayLocal, type CountOutcome, type WithholdChoice } from '../lib/stock'
import { IntoWithholdNote, ScanUpload, WithholdChoiceBox, useMovement, type Scan } from './StockActions'
import { fmtTag, withScan } from '../lib/scans'
import { download, toCsv } from '../lib/reports'
import { useFeed } from './Feed'
import { Photo, PhotoPicker } from './Issues'
import { attachFiles, useAttachments } from '../lib/files'
import { latestJoining } from '../lib/breeding'
import { useFarm } from '../lib/useFarm'
import { useStock, type MobView, type Stock } from '../lib/useStock'
import { useHealth } from '../lib/useHealth'
import type { ActiveWithhold } from '../lib/withholds'
import { useSync, useTable } from '../lib/useSync'
import { Button, Card, Choice, Empty, Field, Notice, Page, Row as ListRow, Section, WarnPopup, go, inputClass, nowIso, query } from '../ui'
import { useSprayWithholds } from '../lib/useLand'
import { partTreated } from '../lib/treat'
import { groupOf, joinedWith } from '../lib/joins'
import { AreaTiles } from './Hubs'
import { Counter, DateField, Discrepancy, PaddockList, SPECIES_LABEL, finalOutcome, fmtDate, outcomeProblem, where, withOtherClass } from './stockParts'

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`

// ---- The list ---------------------------------------------------------------

export function StockList() {
  const stock = useStock()
  const health = useHealth(stock.mobName)
  const untilOf = (id: string) => { const w = (stock.mob(id)?.head ?? 0) > 0 ? health.active.get(id) : undefined; return w ? [w.whpUntil, w.esiUntil].filter(Boolean).sort().at(-1) ?? null : null }
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

      <div className="mt-4"><AreaTiles section="stock" compact /></div>

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
                {here.map((m) => <MobRow key={m.id} stock={stock} m={m} showPlace={false} until={untilOf(m.id)} />)}
              </Card>
            ))}
          </div>
        </Section>
      ))}
      {elsewhere.length > 0 && (
        <Section title="Elsewhere"><Card>{elsewhere.map((m) => <MobRow key={m.id} stock={stock} m={m} until={untilOf(m.id)} />)}</Card></Section>
      )}
      {empty.length > 0 && (
        <Section title="No head left">
          <p className="-mt-1 mb-3 text-sm text-muted">Mobs that were sold, split or merged away. Archive them from their page to hide them.</p>
          <Card>{empty.map((m) => <MobRow key={m.id} stock={stock} m={m} until={untilOf(m.id)} />)}</Card>
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

function MobRow({ stock, m, showPlace = true, until }: { stock: Stock; m: MobView; showPlace?: boolean; until?: string | null }) {
  const classes = m.classes.map((c) => c.name).join(', ')
  return (
    <ListRow onClick={() => go(`/stock/${m.id}`)} label={m.name}
      detail={<>{[showPlace ? where(stock, m) : null, m.daysThere !== null ? `grazing day ${m.daysThere + 1}` : null, classes || null].filter(Boolean).join(' · ')}{until && <span className="ml-1 rounded-full bg-alert-soft px-2 py-0.5 text-xs font-semibold text-alert-ink">WHP until {fmtDate(until)}</span>}</>}
      value={<span className="font-display text-xl text-ink">{m.head}</span>} />
  )
}

// ---- Adding a mob ----------------------------------------------------------------

export function NewMob() {
  const stock = useStock()
  const { saveAll, ctx } = useSync()
  const { isOwner } = useFarm()
  const mv = useMovement('lodged')
  const [name, setName] = useState('')
  const [species, setSpecies] = useState<'cattle' | 'sheep' | 'goat' | 'other'>('cattle')
  const [classId, setClassId] = useState<string>('')
  const [head, setHead] = useState('')
  const [scan, setScan] = useState<Scan | null>(null)
  const [place, setPlace] = useState<{ propertyId: string; paddockId: string | null } | null>(null)
  const [how, setHow] = useState<'on_hand' | 'purchase' | 'agistment_in'>('on_hand')
  const [date, setDate] = useState(todayLocal())
  const nvd = ''
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
    const plan = newMobPlan({ name: n, species, classId: classId || null, head: h, propertyId: place.propertyId, paddockId: place.paddockId, date, how, nvd: nvd.trim(), notes: notes.trim(), movement: how === 'on_hand' ? undefined : mv.value(h) })
    const adds = await withScan(plan.adds, scan, (id, files) => attachFiles(ctx.db, 'stock_events', id, files))
    await saveAll([...(how === 'on_hand' ? [] : [...mv.newContacts, ...(await mv.photos(ctx.db, plan.adds))]), ...adds])
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
        <ScanUpload scan={scan} onChange={setScan} onUse={(n) => setHead(String(n))} useLabel="Use as the head" />
        <Field id="how" label="How they got here">
          <Choice value={how} onChange={setHow} options={[
            { value: 'on_hand', label: 'Already here' }, { value: 'purchase', label: 'Bought' }, { value: 'agistment_in', label: 'Agisted in' },
          ]} />
        </Field>
        <p className="-mt-2 text-xs text-muted">
          {how === 'on_hand' ? 'A starting count for stock already on the farm.' : 'Recorded as an arrival, for your LPA movement records.'}
        </p>
        {how !== 'on_hand' && mv.fields(how === 'purchase' ? 'Vendor' : 'Owner of the stock', 'vendor', isOwner, Number(head) || 0)}
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
  const health = useHealth(stock.mobName)
  const feed = useFeed()
  const joinings = useTable('joinings') ?? []
  const joins = useTable('paddock_joins') ?? []
  const { edit } = useSync()
  const m = stock.mob(id)
  if (!stock.ready || !health.ready) return null
  if (!m) return <Page title="Not found" back="/stock"><p className="mt-4 text-muted">That mob isn't on this phone.</p></Page>
  const recounts = openRecounts(stock.data, id)
  const sharing = stock.mobs.filter((x) => x.id !== m.id && x.head > 0 && x.location?.propertyId === m.location?.propertyId && x.location?.paddockId === m.location?.paddockId)
  const classLabel = m.classes.length === 1 ? m.classes[0].name : m.classes.length > 1 ? 'Mixed classes' : null
  const withhold = health.active.get(id)
  const treatments = health.mobTreatments(id)
  const today = todayLocal()
  const ration = feed.rationOf(id)
  const joining = latestJoining(joinings, id)

  // Stock records and treatments together, newest first.
  const history = [
    ...mobHistory(stock.data, id, { paddock: stock.paddockName, mob: stock.mobName }).map((h) => ({
      key: String(h.event.id), date: h.date, sort: String(h.event.recorded_at ?? h.event.created_at ?? ''),
      text: h.text, edited: h.edited, path: `/stock/${id}/record/${h.event.id}`,
    })),
    ...treatments.map(({ treatment: t, items, inheritedFrom }) => ({
      key: String(t.id), date: String(t.treatment_date), sort: String(t.recorded_at ?? t.created_at ?? ''),
      text: `Treated ${t.head_treated ?? ''} hd${inheritedFrom ? ` (in ${inheritedFrom})` : ''}: ${items.map((i) => health.productName(String(i.product_id))).join(', ') || 'no products'}`,
      edited: !!t.updated_at, path: `/records/treatments/${t.id}`,
    })),
  ].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.sort < b.sort ? 1 : -1))

  return (
    <Page title={m.name} kicker={[SPECIES_LABEL[m.species], classLabel].filter(Boolean).join(' · ')} back="/stock"
      action={<Button kind="secondary" className="shrink-0 px-4" onClick={() => go(`/stock/${id}/edit`)}>Edit</Button>}>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-display text-5xl text-ink">{m.head}</span>
        <span className="text-muted">head · {where(stock, m)}</span>
      </div>
      {m.daysThere !== null && m.head > 0 && (
        <div className="mt-2 inline-flex items-baseline gap-1.5 rounded-full bg-clear px-3 py-1.5 text-green-deep">
          <span className="font-display text-xl">Day {m.daysThere + 1}</span>
          <span className="text-sm font-semibold">grazing {where(stock, m)}</span>
          <span className="text-xs text-muted">· in since {fmtDate(String(m.location?.since ?? ''))}</span>
        </div>
      )}
      {m.classes.length > 1 && (
        <p className="mt-1 text-sm text-muted">{m.classes.map((c) => `${c.name} ${c.head}`).join(' · ')}</p>
      )}
      <div className="mt-5 grid grid-cols-4 gap-2">
        <ActionButton primary label="Move" onClick={() => go(`/stock/${id}/move`)} />
        <ActionButton label="Treat" onClick={() => go(`/stock/${id}/treat`)} />
        <ActionButton label="Split" onClick={() => go(`/stock/${id}/split`)} />
        <ActionButton label="Count" onClick={() => go(`/stock/${id}/count`)} />
        <ActionButton label="Sold or left" onClick={() => go(`/stock/${id}/exit`)} />
        <ActionButton label="Deaths" onClick={() => go(`/stock/${id}/deaths`)} />
        <ActionButton label="Merge" onClick={() => go(`/stock/${id}/merge`)} />
        <ActionButton label="Add stock" onClick={() => go(`/stock/${id}/arrival`)} />
      </div>
      {m.head <= 0 && <div className="mt-4"><Notice tone="info">No head left in this mob. Archive it from Edit to hide it, or Add stock to use it again.</Notice></div>}
      {m.head > 0 && m.location && sharing.length > 0 && (
        <button onClick={() => go(groupMovePath(m.location!.propertyId, m.location!.paddockId))}
          className="mt-3 w-full rounded-2xl border border-line bg-card px-4 py-3 text-left text-sm">
          <span className="font-semibold">Move all in {where(stock, m)}</span>
          <span className="block text-muted">With {sharing.map((x) => x.name).join(', ')}</span>
        </button>
      )}
      {m.head > 0 && <div className="mt-4"><WithholdBanner withhold={withhold} /></div>}
      {m.head > 0 && partTreated(health.treatments, health.items, (x) => stock.mob(x)?.head ?? 0, health.productName).filter((p) => p.mobId === id).map((p) => (
        <div key={String(p.treatment.id)} className="mt-3">
          <Notice tone="warn">
            <b>Part treated:</b> {p.remaining} of {p.ofHead} still to treat with {p.products.join(', ') || 'the treatment'} (from {fmtDate(String(p.treatment.treatment_date))}).{' '}
            <button className="font-semibold underline" onClick={() => go(`/stock/${id}/treat?rest=${p.treatment.id}`)}>Treat the rest</button>{' · '}
            <button className="underline" onClick={() => edit('treatments', String(p.treatment.id), { rest_not_needed: true }, 'Rest not needed')}>Not needed</button>
          </Notice>
        </div>
      ))}
      {m.location?.paddockId && joinedWith(joins, m.location.paddockId).length > 0 && (
        <div className="mt-3"><Notice tone="info">Gate open: also grazing {joinedWith(joins, m.location.paddockId).map((p) => stock.paddockName(p, m.location!.propertyId)).join(', ')}.</Notice></div>
      )}
      {recounts.length > 0 && (
        <div className="mt-3">
          <Notice tone="warn">
            Recount due: counted {String(recounts[0].counted_head)} against a book of {String(recounts[0].expected_head)} on {fmtDate(String(recounts[0].event_date))}.{' '}
            <button className="font-semibold underline" onClick={() => go(`/stock/${id}/count`)}>Count now</button>
          </Notice>
        </div>
      )}
      {(treatments.length > 0 || ration || joining) && (
        <Section title="At a glance">
          <Card>
            {joining && (
              <button onClick={() => go(`/records/breeding/joinings/${joining.id}`)} className="block w-full px-4 py-3 text-left active:bg-paper">
                <span className="block">Joining: <b className="font-semibold">{joining.sire_mob_id ? stock.mobName(String(joining.sire_mob_id)) : String(joining.sire_description ?? 'sires')}</b> · from {fmtDate(String(joining.start_date))}</span>
                {!!joining.expected_birth_start && <span className="block text-sm text-muted">Due from {fmtDate(String(joining.expected_birth_start), { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
              </button>
            )}
            {ration && (
              <button onClick={() => go(`/records/feed/feed?mob=${id}`)} className="block w-full px-4 py-3 text-left active:bg-paper">
                <span className="block">Ration: <b className="font-semibold">{String(ration.name)}</b></span>
                <span className="block text-sm text-muted">Tap to record a feeding</span>
              </button>
            )}
            {treatments.slice(0, 3).flatMap(({ treatment: t, items, inheritedFrom }) => items.map((i) => {
              const p = health.products.find((x) => x.id === i.product_id)
              const days = daysBetween(String(t.treatment_date), today)
              return (
                <button key={String(i.id)} onClick={() => go(`/records/treatments/${t.id}`)} className="block w-full px-4 py-3 text-left active:bg-paper">
                  <span className="block">{String(i.reason ?? 'Treated')}: <b className="font-semibold">{health.productName(String(i.product_id))}</b> · {fmtDate(String(t.treatment_date))}</span>
                  <span className="block text-sm text-muted">{[p?.chemical_group ? `Group ${p.chemical_group}` : null, days === 0 ? 'today' : `${days} days ago`, inheritedFrom ? `given in ${inheritedFrom}` : null].filter(Boolean).join(' · ')}</span>
                </button>
              )
            }))}
          </Card>
        </Section>
      )}
      <Section title="History">
        {history.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
          <Card>
            {history.map((h) => (
              <button key={h.key} onClick={() => go(h.path)} className="flex w-full gap-4 px-4 py-3 text-left active:bg-paper">
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

function ActionButton({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick}
      className={`min-h-12 rounded-2xl px-1 text-sm font-semibold leading-tight ${primary ? 'bg-green text-paper' : 'border border-line bg-card'}`}>{label}</button>
  )
}

export function WithholdBanner({ withhold }: { withhold?: ActiveWithhold }) {
  if (!withhold) return <Notice tone="ok">Clear to sell: no withhold running.</Notice>
  const parts = [withhold.whpUntil ? `WHP until ${fmtDate(withhold.whpUntil, { weekday: 'short', day: 'numeric', month: 'short' })}` : null,
    withhold.esiUntil ? `ESI until ${fmtDate(withhold.esiUntil, { weekday: 'short', day: 'numeric', month: 'short' })}` : null].filter(Boolean)
  return <Notice tone="alert"><b className="font-semibold">Under withhold.</b> {parts.join(', ')} ({withhold.products.join(', ')}). Clear the day after.</Notice>
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
  // Coming from the map: the paddock that was tapped.
  const [to, setTo] = useState<{ propertyId: string; paddockId: string | null } | null>(() => {
    const pid = query().get('to')
    const pdk = pid ? stock.paddocks.find((d) => d.id === pid) : undefined
    return pdk ? { propertyId: String(pdk.property_id), paddockId: String(pdk.id) } : null
  })
  const [counted, setCounted] = useState(m.head)
  const [scan, setScan] = useState<Scan | null>(null)
  const [outcome, setOutcome] = useState<CountOutcome>({ kind: 'recount_later' })
  const [date, setDate] = useState(todayLocal())
  const [nvd, setNvd] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const health = useHealth(stock.mobName)
  const active = health.active.get(m.id)
  // Moving into a paddock with other mobs: keep separate (default) or merge into one.
  const [mergeInto, setMergeInto] = useState('')
  const [nvdPhotos, setNvdPhotos] = useState<File[]>([])
  const { ctx } = useSync()
  const [choice, setChoice] = useState<WithholdChoice>(null)
  const crossing = !!to && !!m.location && to.propertyId !== m.location.propertyId
  const toName = to ? stock.paddockName(to.paddockId, to.propertyId) : null
  const sprayUntil = useSprayWithholds()
  const joinsAll = useTable('paddock_joins') ?? []
  // Sprayed: the paddock itself, or one joined to it by an open gate.
  const sprayed = to?.paddockId ? groupOf(joinsAll, to.paddockId).map((p) => sprayUntil.get(p)).filter(Boolean).sort().at(-1) : undefined
  const sharing = to ? stock.mobs.filter((x) => x.id !== m.id && x.head > 0 && x.location?.propertyId === to.propertyId && x.location.paddockId === to.paddockId) : []

  async function save() {
    if (!to) return setError('Choose where they are going.')
    const problem = outcomeProblem(m.head, counted, outcome)
    if (problem) return setError(problem)
    const o = withOtherClass(stock, finalOutcome(m.head, counted, outcome))
    const plan = movePlan({ mobId: m.id, date, from: m.location, to, book: m.head, counted, outcome: o, nvd: nvd.trim(), notes: notes.trim(), openRecounts: openRecounts(stock.data, m.id) })
    if (crossing && nvdPhotos.length) plan.adds.push(...(await attachFiles(ctx.db, 'stock_events', String(plan.adds[0].values.id), nvdPhotos)))
    const scanned = await withScan(plan.adds, scan, (id, files) => attachFiles(ctx.db, 'stock_events', id, files))
    const into = sharing.find((x) => x.id === mergeInto)
    if (into) {
      if (active && !choice) return setError(`Choose whether ${m.name}'s withhold applies to ${into.name}.`)
      // Merge what's actually moving (after any accepted count difference).
      const lines = m.classes.map((c) => ({ classId: c.id, head: c.head }))
      if (o.kind === 'accept') {
        const l = lines.find((x) => x.classId === o.classId) ?? lines[0]
        if (l) l.head += counted - m.head
      }
      const merge = mergePlan({ intoMobId: into.id, date, archiveEmptied: true, sources: [{ mobId: m.id, lines: lines.filter((l) => l.head > 0), withholdChoice: active ? choice : null }] })
      await saveAll([...scanned, ...merge.adds], [...plan.edits, ...merge.edits])
      go(`/stock/${into.id}`)
      return
    }
    await saveAll(scanned, plan.edits)
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

      <WarnPopup show={!!sprayed} warnKey={to?.paddockId ?? ''} title="Sprayed paddock">
        <b>{toName}</b> was sprayed and shouldn't be grazed until after {fmtDate(sprayed ?? '', { day: 'numeric', month: 'short', year: 'numeric' })}. Choose another paddock, or check the spray record first.
      </WarnPopup>
      <div className="mt-6 mb-2 text-sm font-semibold text-muted">Choose a paddock</div>
      <PaddockList stock={stock} value={to} onChange={(v) => { setTo(v); setError(null) }} exclude={m.location} mobId={m.id} />
      {sharing.length > 0 && (
        <div className="mt-4 rounded-2xl border border-line bg-card p-4">
          <div className="font-semibold">{toName} already has {sharing.map((x) => `${x.name} (${x.head})`).join(', ')}</div>
          <div className="mt-3 flex flex-col gap-2">
            <label className="flex items-center gap-3"><input type="radio" checked={mergeInto === ''} onChange={() => setMergeInto('')} className="size-5 accent-green" /> Keep separate mobs (e.g. bulls in with cows)</label>
            {sharing.map((x) => (
              <label key={x.id} className="flex items-center gap-3"><input type="radio" checked={mergeInto === x.id} onChange={() => setMergeInto(x.id)} className="size-5 accent-green" /> Merge into {x.name}</label>
            ))}
          </div>
          {mergeInto && active && (
            <div className="mt-3"><WithholdChoiceBox whole active={active} value={choice} onChange={setChoice} toName={stock.mobName(mergeInto)} /></div>
          )}
          {mergeInto && !active && health.active.get(mergeInto) && (
            <div className="mt-3"><IntoWithholdNote into={stock.mobName(mergeInto)} active={health.active.get(mergeInto)!} head={moving} /></div>
          )}
        </div>
      )}

      <h2 className="mt-8 mb-3 text-xl text-green-deep">Count through the gate</h2>
      <Counter book={m.head} value={counted} onChange={setCounted} />
      <div className="mt-3"><ScanUpload scan={scan} onChange={setScan} onUse={setCounted} /></div>
      <Discrepancy stock={stock} mob={m} book={m.head} counted={counted} outcome={outcome} onChange={setOutcome} />

      <div className="mt-6 flex flex-col gap-4">
        {crossing && (
          <>
            <Field id="nvd" label="NVD or waybill number" hint="Moving to another property (different PIC) needs an NVD.">
              <input id="nvd" value={nvd} onChange={(e) => setNvd(e.target.value)} className={inputClass} />
            </Field>
            <PhotoPicker photos={nvdPhotos} onChange={setNvdPhotos} />
          </>
        )}
        <DateField value={date} onChange={setDate} />
        <Field id="notes" label="Notes">
          <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save} disabled={!to}>{!to ? 'Choose a paddock' : counted !== m.head && outcome.kind === 'recount_later'
          ? `Move to ${toName}: counted ${counted}, recount later`
          : `Move ${moving} head to ${toName}`}</Button>
        {to && counted !== m.head && outcome.kind === 'recount_later' && (
          <p className="text-sm text-muted">The book stays at {m.head} until the recount. The count of {counted} is kept on the record.</p>
        )}
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
  const { saveAll, ctx } = useSync()
  const [counted, setCounted] = useState(m.head)
  const [scan, setScan] = useState<Scan | null>(null)
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
    await saveAll(await withScan(plan.adds, scan, (id, files) => attachFiles(ctx.db, 'stock_events', id, files)), plan.edits)
    go(`/stock/${m.id}`)
  }

  return (
    <Page title={m.name} kicker="Count" back={`/stock/${m.id}`}>
      <p className="mt-3 text-muted">{where(stock, m)}. A count is recorded even when it matches the book.</p>
      {recounts.length > 0 && <div className="mt-4"><Notice tone="info">This count also closes the recount from {fmtDate(String(recounts[0].event_date))}.</Notice></div>}
      <div className="mt-6"><Counter book={m.head} value={counted} onChange={setCounted} /></div>
      <div className="mt-3"><ScanUpload scan={scan} onChange={setScan} onUse={setCounted} /></div>
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
  const [nvd, setNvd] = useState(String(event.nvd_number ?? ''))
  const [nlis, setNlis] = useState(String(event.nlis_transfer_status ?? ''))
  const movement = ['arrival', 'exit', 'paddock_move'].includes(String(event.event_type))
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const linked = stock.data.events.filter((e) => e.related_event_id === event.id && !e.deleted_at)
  const back = `/stock/${mobId}`
  const attachments = useAttachments('stock_events', String(event.id))
  const [morePhotos, setMorePhotos] = useState<File[]>([])
  const [scan, setScan] = useState<Scan | null>(null)
  const { ctx } = useSync()
  const tags = (event.scanned_eids as string[] | null) ?? []

  async function save(e: FormEvent) {
    e.preventDefault()
    await edit('stock_events', String(event.id), { event_date: date, notes: notes.trim() || null, ...(movement ? { nvd_number: nvd.trim() || null, nlis_transfer_status: nlis || null } : {}) }, reason.trim() || undefined)
    if (morePhotos.length) await saveAll(await attachFiles(ctx.db, 'stock_events', String(event.id), morePhotos))
    // A scan file added afterwards: its tags onto the record, the file attached.
    if (scan) {
      const files = await withScan([{ table: 'stock_events', values: { id: String(event.id) } }], scan, (id, f) => attachFiles(ctx.db, 'stock_events', id, f))
      await saveAll(files.slice(1), [{ table: 'stock_events', id: String(event.id), changes: { scanned_eids: scan.tags } }])
    }
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
        {movement && (
          <div className="grid grid-cols-2 gap-3">
            <Field id="nvd" label="NVD or waybill no."><input id="nvd" value={nvd} onChange={(e) => setNvd(e.target.value)} className={inputClass} /></Field>
            <Field id="nlis" label="NLIS transfer">
              <select id="nlis" value={nlis} onChange={(e) => setNlis(e.target.value)} className={inputClass}>
                <option value="">Not recorded</option>
                {NLIS_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
          </div>
        )}
        <Field id="notes" label="Notes">
          <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </Field>
        {movement && (
          <div>
            <div className="mb-1 text-sm font-semibold text-muted">NVD photos and files</div>
            {attachments.length > 0 && <div className="mb-2 grid grid-cols-3 gap-2">{attachments.map((a) => <Photo key={String(a.id)} a={a} />)}</div>}
            <PhotoPicker photos={morePhotos} onChange={setMorePhotos} />
          </div>
        )}
        {tags.length > 0 ? (
          <div className="rounded-2xl border border-line bg-card p-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-semibold">Wand scan: {tags.length} {tags.length === 1 ? 'tag' : 'tags'}</div>
              <button type="button" className="text-sm font-semibold text-green underline"
                onClick={() => download(`tags-${String(event.event_date)}-${stock.mobName(mobId).replace(/W+/g, '-')}.csv`, toCsv(['EID'], tags.map((t) => [t])))}>Download tag list</button>
            </div>
            <p className="mt-1 break-words text-xs text-muted">{tags.slice(0, 6).map(fmtTag).join(', ')}{tags.length > 6 ? `, and ${tags.length - 6} more` : ''}</p>
          </div>
        ) : <ScanUpload scan={scan} onChange={setScan} />}
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
