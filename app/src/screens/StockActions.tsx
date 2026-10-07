// Split, merge, sold or left, deaths, and adding stock to a mob.
import { useState, type ReactNode } from 'react'
import type { Row } from '../lib/db'
import {
  EXIT_REASONS, NLIS_STATUS, arrivalPlan, deathsPlan, exitPlan, mergePlan, splitPlan, todayLocal,
  type ClassHead, type Movement, type WithholdChoice,
} from '../lib/stock'
import type { NewRecord } from '../lib/sync'
import type { FarmDb } from '../lib/db'
import { attachFiles } from '../lib/files'
import { parseScan, withScan } from '../lib/scans'
import { PhotoPicker } from './Issues'
import { useFarm } from '../lib/useFarm'
import { useHealth } from '../lib/useHealth'
import { useStock, type MobView, type Stock } from '../lib/useStock'
import { useSync, useTable } from '../lib/useSync'
import { exitBreach, type ActiveWithhold } from '../lib/withholds'
import { Button, Choice, Field, Notice, Page, Section, go, inputClass } from '../ui'
import { DateField, PaddockList, fmtDate } from './stockParts'

const num = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() === '' || Number.isNaN(n) ? null : n }
const int = (s: string) => { const n = parseInt(s, 10); return Number.isNaN(n) ? 0 : n }

// Loads the mob and stock, then shows the form.
function WithMob({ id, children }: { id: string; children: (stock: Stock, m: MobView, active: ActiveWithhold | undefined) => ReactNode }) {
  const stock = useStock()
  const health = useHealth(stock.mobName)
  if (!stock.ready || !health.ready) return null
  const m = stock.mob(id)
  if (!m) return <Page title="Not found" back="/stock"><p className="mt-4 text-muted">That mob isn't on this phone.</p></Page>
  return <>{children(stock, m, health.active.get(id))}</>
}

// Head per class of the mob (one box when the mob has one class).
function ClassHeads({ m, value, onChange, max = true }: { m: MobView; value: Record<string, string>; onChange: (v: Record<string, string>) => void; max?: boolean }) {
  const classes = m.classes.length > 0 ? m.classes : [{ id: null, name: 'Head', head: m.head }]
  return (
    <div className="flex flex-col gap-2">
      {classes.map((c) => {
        const k = c.id ?? 'none'
        return (
          <div key={k} className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-2">
            <label htmlFor={`h-${k}`} className="min-w-0 flex-1">
              <span className="block font-medium">{classes.length === 1 && c.id === null ? 'Head' : c.name}</span>
              {max && <span className="block text-xs text-muted">{c.head} in the mob</span>}
            </label>
            <input id={`h-${k}`} inputMode="numeric" value={value[k] ?? ''} onChange={(e) => onChange({ ...value, [k]: e.target.value.replace(/\D/g, '') })}
              placeholder="0" className="h-11 w-20 rounded-lg border border-line bg-paper text-center text-lg" />
          </div>
        )
      })}
    </div>
  )
}

const toLines = (v: Record<string, string>): ClassHead[] =>
  Object.entries(v).map(([k, h]) => ({ classId: k === 'none' ? null : k, head: int(h) })).filter((l) => l.head > 0)

function overBook(m: MobView, lines: ClassHead[]): string | null {
  for (const l of lines) {
    const have = m.classes.find((c) => c.id === l.classId)?.head ?? (m.classes.length === 0 ? m.head : 0)
    if (l.head > have) return `That's more than the ${have} on the books. Do a count first if the mob is bigger.`
  }
  return null
}

// When stock under withhold go to another mob: carry it, or not.
// whole: all of the withheld mob is going (a merge), so not applying it would
// leave treated stock showing as clear.
export function WithholdChoiceBox({ active, value, onChange, toName, whole }: { active: ActiveWithhold; value: WithholdChoice; onChange: (v: WithholdChoice) => void; toName: string; whole?: boolean }) {
  const until = active.whpUntil ?? active.esiUntil
  return (
    <div className="rounded-2xl border border-alert/30 bg-alert-soft p-4 text-alert-ink">
      <div className="font-semibold">These stock are under withhold until {until ? fmtDate(until) : '?'} ({active.products.join(', ')}).</div>
      <div className="mt-3 flex flex-col gap-2">
        <label className="flex items-center gap-3"><input type="radio" checked={value === 'applied'} onChange={() => onChange('applied')} className="size-5 accent-green" /> Apply the withhold to {toName}</label>
        <label className="flex items-center gap-3"><input type="radio" checked={value === 'not_applied'} onChange={() => onChange('not_applied')} className="size-5 accent-green" /> Don't apply it (e.g. these ones weren't treated)</label>
      </div>
      {whole && value === 'not_applied' && (
        <p className="mt-3 rounded-xl bg-card px-3 py-2 text-sm font-semibold">All of this mob is going into {toName}, and {toName} won't show as under withhold. Only choose this if these stock really weren't treated.</p>
      )}
    </div>
  )
}

// Clear stock going into a mob that is under withhold: the whole mob then
// shows as under withhold, so the clear ones need keeping track of.
export function IntoWithholdNote({ into, active, head }: { into: string; active: ActiveWithhold; head: number }) {
  const until = active.whpUntil ?? active.esiUntil
  return (
    <div className="rounded-2xl border border-amber/40 bg-amber-soft p-4 text-sm">
      <b>{into} is under withhold until {until ? fmtDate(until) : '?'}</b> ({active.products.join(', ')}). Once merged, the whole mob shows as under withhold, including the {head} head coming in that weren't treated. Keep track of them (tag or note) if they need to be sold before then.
    </div>
  )
}

// ---- Contacts (buyer, vendor, carrier), with quick add ------------------------

// People stock come from or go to are one group: a vendor one month is a
// buyer the next. Carriers, suppliers and contractors each have their own list.
const STOCK_KINDS = ['vendor', 'buyer', 'agent', 'agistor', 'owner']
const kindsFor = (kind: string) => (STOCK_KINDS.includes(kind) ? STOCK_KINDS : [kind])
// The second box when adding someone: a PIC for stock people, a rego for a
// carrier (filled into the movement's truck rego), otherwise a phone number.
const extraFor = (kind: string) => (STOCK_KINDS.includes(kind) ? { label: 'PIC', column: 'pic', upper: true } : kind === 'carrier' ? { label: 'Truck rego', column: null, upper: true } : { label: 'Phone', column: 'phone', upper: false })

export function ContactPicker({ id, label, kind, value, onChange, newContacts, setNewContacts, onExtra }: {
  id: string; label: string; kind: string; value: string; onChange: (v: string) => void
  newContacts: NewRecord[]; setNewContacts: (n: NewRecord[]) => void
  // A carrier's rego typed when adding them.
  onExtra?: (v: string) => void
}) {
  const contacts = useTable('contacts')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [pic, setPic] = useState('')
  const wanted = kindsFor(kind)
  const extra = extraFor(kind)
  const list = [...(contacts ?? []).filter((c) => !c.archived_at), ...newContacts.map((n) => n.values)]
    .filter((c) => c.id === value || ((c.kinds as string[] | null) ?? []).some((k) => wanted.includes(k)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  if (adding) {
    return (
      <div className="rounded-2xl border border-line bg-card p-3">
        <div className="mb-2 text-sm font-semibold text-muted">New {label.toLowerCase()}</div>
        <div className="grid grid-cols-[1fr_8rem] gap-2">
          <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name or business" className={inputClass} />
          <input aria-label={extra.label} value={pic} inputMode={extra.column === 'phone' ? 'tel' : undefined} onChange={(e) => setPic(extra.upper ? e.target.value.toUpperCase() : e.target.value)} placeholder={extra.label} className={`${inputClass} placeholder:normal-case`} />
        </div>
        <div className="mt-2 flex gap-2">
          <Button className="flex-1" onClick={() => {
            if (!name.trim()) return
            const cid = crypto.randomUUID()
            setNewContacts([...newContacts, { table: 'contacts', values: { id: cid, name: name.trim(), ...(extra.column ? { [extra.column]: pic.trim() || null } : {}), kinds: [kind] } }])
            if (!extra.column && pic.trim()) onExtra?.(pic.trim())
            onChange(cid); setAdding(false); setName(''); setPic('')
          }}>Use</Button>
          <Button kind="secondary" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      </div>
    )
  }
  return (
    <Field id={id} label={label}>
      <select id={id} value={value} onChange={(e) => (e.target.value === '+' ? setAdding(true) : onChange(e.target.value))} className={inputClass}>
        <option value="">None</option>
        {list.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}{STOCK_KINDS.includes(kind) && c.pic ? ` · ${c.pic}` : ''}</option>)}
        <option value="+">+ Add new</option>
      </select>
    </Field>
  )
}

// NVD, NLIS, carrier, weight and (owners) price for arrivals and exits.
export function useMovement(defaultNlis: string) {
  const [counterparty, setCounterparty] = useState('')
  const [carrier, setCarrier] = useState('')
  const [nvd, setNvd] = useState('')
  const [rego, setRego] = useState('')
  const [nlis, setNlis] = useState(defaultNlis)
  // Average weight per head; the total is worked out from the head count.
  const [weight, setWeight] = useState('')
  const events = useTable('stock_events')
  const [notes, setNotes] = useState('')
  const [perHead, setPerHead] = useState('')
  const [perKg, setPerKg] = useState('')
  const [total, setTotal] = useState('')
  const [newContacts, setNewContacts] = useState<NewRecord[]>([])
  const [nvdPhotos, setNvdPhotos] = useState<File[]>([])
  // The NVD photo(s), attached to the movement's stock record.
  const photos = (db: FarmDb, adds: NewRecord[]) => {
    const event = adds.find((a) => a.table === 'stock_events')
    return event && nvdPhotos.length ? attachFiles(db, 'stock_events', String(event.values.id), nvdPhotos) : Promise.resolve([])
  }
  const chooseCarrier = (id: string) => {
    setCarrier(id)
    // The rego this carrier used last time, if nothing is typed yet.
    const last = (events ?? []).filter((e) => e.carrier_contact_id === id && e.truck_rego)
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0]
    if (last && !rego.trim()) setRego(String(last.truck_rego))
  }
  const value = (head: number): Movement => ({
    counterpartyId: counterparty || null, nvd: nvd.trim() || null, carrierId: carrier || null, truckRego: rego.trim() || null,
    nlis: nlis || null, totalWeightKg: num(weight) !== null && head > 0 ? Math.round(num(weight)! * head * 10) / 10 : null, notes: notes.trim() || null,
    price: { perHead: num(perHead), perKg: num(perKg), total: num(total) },
  })
  const fields = (who: string, whoKind: string, isOwner: boolean, head = 0) => (
    <div className="flex flex-col gap-4">
      <ContactPicker id="who" label={who} kind={whoKind} value={counterparty} onChange={setCounterparty} newContacts={newContacts} setNewContacts={setNewContacts} />
      <div className="grid grid-cols-2 gap-3">
        <Field id="nvd" label="NVD or waybill no."><input id="nvd" value={nvd} onChange={(e) => setNvd(e.target.value)} className={inputClass} /></Field>
        <Field id="nlis" label="NLIS transfer">
          <select id="nlis" value={nlis} onChange={(e) => setNlis(e.target.value)} className={inputClass}>{NLIS_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        </Field>
      </div>
      <div>
        <div className="mb-1 text-sm font-semibold text-muted">Photo of the NVD</div>
        <PhotoPicker photos={nvdPhotos} onChange={setNvdPhotos} />
      </div>
      <ContactPicker id="carrier" label="Carrier" kind="carrier" value={carrier} onChange={chooseCarrier} onExtra={setRego} newContacts={newContacts} setNewContacts={setNewContacts} />
      <div className="grid grid-cols-2 gap-3">
        <Field id="rego" label="Truck rego"><input id="rego" value={rego} onChange={(e) => setRego(e.target.value.toUpperCase())} className={inputClass} /></Field>
        <Field id="weight" label="Weight (kg/head)" hint={num(weight) !== null && head > 0 ? `${Math.round(num(weight)! * head).toLocaleString('en-AU')} kg in all` : undefined}><input id="weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClass} placeholder="Average" /></Field>
      </div>
      {isOwner && (
        <div className="rounded-2xl border border-line bg-card p-3">
          <div className="mb-2 text-sm font-semibold text-muted">Price, including GST (owners only)</div>
          <div className="grid grid-cols-3 gap-2">
            <Field id="ph" label="$/head"><input id="ph" inputMode="decimal" value={perHead} onChange={(e) => setPerHead(e.target.value)} className={inputClass} /></Field>
            <Field id="pk" label="$/kg"><input id="pk" inputMode="decimal" value={perKg} onChange={(e) => setPerKg(e.target.value)} className={inputClass} /></Field>
            <Field id="pt" label="Total $"><input id="pt" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={inputClass} /></Field>
          </div>
        </div>
      )}
      <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
    </div>
  )
  return { value, fields, newContacts, photos }
}

// ---- Split ---------------------------------------------------------------------

export function SplitScreen({ id }: { id: string }) {
  return <WithMob id={id}>{(stock, m, active) => <SplitForm key={id} stock={stock} m={m} active={active} />}</WithMob>
}

function SplitForm({ stock, m, active }: { stock: Stock; m: MobView; active?: ActiveWithhold }) {
  const { saveAll } = useSync()
  const [name, setName] = useState('')
  const [heads, setHeads] = useState<Record<string, string>>({})
  const [stay, setStay] = useState(true)
  const [to, setTo] = useState<{ propertyId: string; paddockId: string | null } | null>(null)
  const [choice, setChoice] = useState<WithholdChoice>(null)
  const [date, setDate] = useState(todayLocal())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const lines = toLines(heads)
  const total = lines.reduce((n, l) => n + l.head, 0)

  async function save() {
    const n = name.trim().replace(/\s+/g, ' ')
    if (!n) return setError('Name the new mob, e.g. Heifers to join.')
    if (stock.mobs.some((x) => x.name.toLowerCase() === n.toLowerCase())) return setError(`There's already a mob called ${n}.`)
    if (total === 0) return setError('How many are going into the new mob?')
    const over = overBook(m, lines)
    if (over) return setError(over)
    if (!stay && !to) return setError('Choose the paddock the new mob goes to.')
    if (active && !choice) return setError('Choose whether the withhold applies to the new mob.')
    const place = stay ? m.location : to
    const plan = splitPlan({ sourceMobId: m.id, date, notes, parts: [{
      newMob: { name: n, species: m.species }, lines, withholdChoice: active ? choice : null,
      to: place ? { propertyId: place.propertyId, paddockId: place.paddockId } : null,
    }] })
    await saveAll(plan.adds)
    go(`/stock/${plan.mobIds[0]}`)
  }

  return (
    <Page title={`Split ${m.name}`} kicker="Split mob" back={`/stock/${m.id}`}>
      <p className="mt-3 text-muted">Take some of the mob off into a new mob. Their treatment history goes with them.</p>
      <div className="mt-5 flex flex-col gap-4">
        <Field id="name" label="New mob name"><input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Heifers to join" /></Field>
        <div>
          <div className="mb-2 text-sm font-semibold text-muted">How many go into the new mob</div>
          <ClassHeads m={m} value={heads} onChange={setHeads} />
          {total > 0 && <p className="mt-2 text-sm text-muted">{m.name} keeps {m.head - total}, {name || 'the new mob'} gets {total}.</p>}
        </div>
        {active && <WithholdChoiceBox active={active} value={choice} onChange={setChoice} toName={name || 'the new mob'} />}
        <Field id="where" label="New mob is in">
          <Choice value={stay ? 'stay' : 'move'} onChange={(v) => setStay(v === 'stay')} options={[{ value: 'stay', label: 'The same paddock' }, { value: 'move', label: 'Another paddock' }]} />
        </Field>
        {!stay && <PaddockList stock={stock} value={to} onChange={setTo} exclude={m.location} />}
        <DateField value={date} onChange={setDate} />
        <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save}>Split off {total || ''} head</Button>
      </div>
    </Page>
  )
}

// ---- Merge ----------------------------------------------------------------------

export function MergeScreen({ id }: { id: string }) {
  return <WithMob id={id}>{(stock, m) => <MergeForm key={id} stock={stock} m={m} />}</WithMob>
}

function MergeForm({ stock, m }: { stock: Stock; m: MobView }) {
  const { saveAll } = useSync()
  const health = useHealth(stock.mobName)
  const [chosen, setChosen] = useState<string[]>([])
  const [choices, setChoices] = useState<Record<string, WithholdChoice>>({})
  const [archive, setArchive] = useState(true)
  const [date, setDate] = useState(todayLocal())
  const [error, setError] = useState<string | null>(null)
  const candidates = stock.mobs.filter((x) => x.id !== m.id && x.head > 0 && x.species === m.species)
    .sort((a, b) => Number(b.location?.paddockId === m.location?.paddockId) - Number(a.location?.paddockId === m.location?.paddockId))
  const toggle = (mid: string) => setChosen((c) => (c.includes(mid) ? c.filter((x) => x !== mid) : [...c, mid]))
  const intoActive = health.active.get(m.id)

  async function save() {
    if (chosen.length === 0) return setError('Tick the mob(s) to merge in.')
    for (const mid of chosen) if (health.active.get(mid) && !choices[mid]) return setError(`Choose whether ${stock.mobName(mid)}'s withhold applies to ${m.name}.`)
    const plan = mergePlan({
      intoMobId: m.id, date, archiveEmptied: archive,
      sources: chosen.map((mid) => {
        const src = stock.mob(mid)!
        return { mobId: mid, lines: src.classes.map((c) => ({ classId: c.id, head: c.head })), withholdChoice: health.active.get(mid) ? choices[mid] ?? null : null }
      }),
    })
    await saveAll(plan.adds, plan.edits)
    go(`/stock/${m.id}`)
  }

  return (
    <Page title={`Merge into ${m.name}`} kicker="Merge mobs" back={`/stock/${m.id}`}>
      <p className="mt-3 text-muted">The ticked mobs join {m.name}. Their treatment history comes too. Mobs can also share a paddock without merging.</p>
      <div className="mt-5 flex flex-col gap-3">
        {candidates.length === 0 && <Notice tone="info">There are no other {m.species} mobs to merge.</Notice>}
        {candidates.map((x) => {
          const active = health.active.get(x.id)
          const on = chosen.includes(x.id)
          return (
            <div key={x.id} className="rounded-2xl border border-line bg-card p-4">
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={on} onChange={() => toggle(x.id)} className="size-6 accent-green" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{x.name} · {x.head} hd</span>
                  <span className="block text-sm text-muted">{x.location ? stock.paddockName(x.location.paddockId, x.location.propertyId) : 'No paddock'}{active ? ' · under withhold' : ''}</span>
                </span>
              </label>
              {on && active && <div className="mt-3"><WithholdChoiceBox whole active={active} value={choices[x.id] ?? null} onChange={(v) => setChoices({ ...choices, [x.id]: v })} toName={m.name} /></div>}
              {on && !active && intoActive && <div className="mt-3"><IntoWithholdNote into={m.name} active={intoActive} head={x.head} /></div>}
            </div>
          )
        })}
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={archive} onChange={(e) => setArchive(e.target.checked)} className="size-5 accent-green" /> Archive the merged mobs once they're empty</label>
        <DateField value={date} onChange={setDate} />
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save} disabled={chosen.length === 0}>Merge {chosen.length || ''} {chosen.length === 1 ? 'mob' : 'mobs'} into {m.name}</Button>
      </div>
    </Page>
  )
}

// ---- Sold or left ------------------------------------------------------------------

export function ExitScreen({ id }: { id: string }) {
  return <WithMob id={id}>{(stock, m) => <ExitForm key={id} stock={stock} m={m} />}</WithMob>
}

function ExitForm({ stock, m }: { stock: Stock; m: MobView }) {
  const { saveAll, ctx } = useSync()
  const { isOwner } = useFarm()
  const health = useHealth(stock.mobName)
  const mv = useMovement('to_do')
  const [reason, setReason] = useState('saleyard')
  const [market, setMarket] = useState<'domestic' | 'export' | 'unknown'>('domestic')
  const [heads, setHeads] = useState<Record<string, string>>(() => Object.fromEntries((m.classes.length ? m.classes : [{ id: null, head: m.head }]).map((c) => [c.id ?? 'none', String(c.head)])))
  const [scan, setScan] = useState<Scan | null>(null)
  const [date, setDate] = useState(todayLocal())
  const [override, setOverride] = useState('')
  const [error, setError] = useState<string | null>(null)
  const lines = toLines(heads)
  const total = lines.reduce((n, l) => n + l.head, 0)
  const selling = ['sale', 'saleyard', 'slaughter'].includes(reason)
  const breach = selling ? exitBreach(health.withholds, m.id, date, market) : null

  async function save() {
    if (total === 0) return setError('How many head?')
    const over = overBook(m, lines)
    if (over) return setError(over)
    if (breach && !override.trim()) return setError('These stock are under withhold. Give a reason to record the sale anyway, or check the date.')
    const planned = exitPlan({
      mobId: m.id, date, fromPropertyId: m.location?.propertyId ?? null, reason, market, lines,
      movement: mv.value(total), overrideReason: breach ? override.trim() : null,
    })
    const adds = await withScan(planned, scan, (id, files) => attachFiles(ctx.db, 'stock_events', id, files))
    await saveAll([...mv.newContacts, ...adds, ...(await mv.photos(ctx.db, planned))])
    go(`/stock/${m.id}`)
  }

  return (
    <Page title={m.name} kicker="Sold or left" back={`/stock/${m.id}`}>
      <div className="mt-5 flex flex-col gap-4">
        <Field id="reason" label="Where they went">
          <select id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>{EXIT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
        </Field>
        {selling && (
          <Field id="market" label="Market">
            <Choice value={market} onChange={setMarket} options={[{ value: 'domestic', label: 'Domestic' }, { value: 'export', label: 'Export' }, { value: 'unknown', label: "Don't know" }]} />
          </Field>
        )}
        <div>
          <div className="mb-2 text-sm font-semibold text-muted">How many</div>
          <ClassHeads m={m} value={heads} onChange={setHeads} />
        </div>
        <ScanUpload scan={scan} onChange={setScan} onUse={Object.keys(heads).length === 1 ? (n) => setHeads({ [Object.keys(heads)[0]]: String(n) }) : undefined} useLabel="Use as the head" />
        {scan && Object.keys(heads).length > 1 && <p className="-mt-2 text-xs text-muted">{scan.tags.length} tags scanned: check the head by class adds up ({total} so far).</p>}
        <DateField value={date} onChange={setDate} />
        {breach && (
          <div className="rounded-2xl border border-alert/30 bg-alert-soft p-4 text-alert-ink">
            <div className="font-semibold">Under withhold on {fmtDate(date)}</div>
            <p className="mt-1 text-sm">{breach.product}: WHP until {breach.whpUntil ? fmtDate(breach.whpUntil) : '-'}{breach.esiUntil ? `, ESI until ${fmtDate(breach.esiUntil)}` : ''}. Selling them now may break the withholding period.</p>
            <Field id="override" label="Reason to record it anyway"><input id="override" value={override} onChange={(e) => setOverride(e.target.value)} className={inputClass} placeholder="e.g. sold as store, buyer told of WHP" /></Field>
          </div>
        )}
        <Section title="Movement details">{mv.fields(reason === 'agistment_out' ? 'Agistor' : reason === 'return_from_agistment' ? 'Owner' : 'Buyer or destination', 'buyer', isOwner, total)}</Section>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save}>Record {total} head leaving</Button>
      </div>
    </Page>
  )
}

// ---- Deaths --------------------------------------------------------------------------

export function DeathsScreen({ id }: { id: string }) {
  return <WithMob id={id}>{(_stock, m) => <DeathsForm key={id} m={m} />}</WithMob>
}

function DeathsForm({ m }: { m: MobView }) {
  const { saveAll } = useSync()
  const [heads, setHeads] = useState<Record<string, string>>({})
  const [cause, setCause] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const lines = toLines(heads)

  async function save() {
    if (lines.length === 0) return setError('How many died?')
    const over = overBook(m, lines)
    if (over) return setError(over)
    await saveAll(deathsPlan({ mobId: m.id, date, lines, cause: cause.trim() || null, notes: notes.trim() || null }))
    go(`/stock/${m.id}`)
  }

  return (
    <Page title={m.name} kicker="Deaths" back={`/stock/${m.id}`}>
      <div className="mt-5 flex flex-col gap-4">
        <ClassHeads m={m} value={heads} onChange={setHeads} />
        <Field id="cause" label="Cause, if known"><input id="cause" value={cause} onChange={(e) => setCause(e.target.value)} className={inputClass} placeholder="e.g. Snake bite, calving" /></Field>
        <DateField value={date} onChange={setDate} />
        <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save}>Record deaths</Button>
      </div>
    </Page>
  )
}

// ---- Adding stock to a mob -------------------------------------------------------------

export function ArrivalScreen({ id }: { id: string }) {
  return <WithMob id={id}>{(stock, m) => <ArrivalForm key={id} stock={stock} m={m} />}</WithMob>
}

function ArrivalForm({ stock, m }: { stock: Stock; m: MobView }) {
  const { saveAll, ctx } = useSync()
  const { isOwner } = useFarm()
  const mv = useMovement('lodged')
  const [reason, setReason] = useState<'purchase' | 'agistment_in' | 'return_from_agistment'>('purchase')
  const [classId, setClassId] = useState(m.classes[0]?.id ?? '')
  const [head, setHead] = useState('')
  const [scan, setScan] = useState<Scan | null>(null)
  const [date, setDate] = useState(todayLocal())
  const [error, setError] = useState<string | null>(null)
  const classes = stock.classes.filter((c) => c.species === m.species)

  async function save() {
    const h = int(head)
    if (h <= 0) return setError('How many head arrived?')
    const planned = arrivalPlan({ mobId: m.id, date, toPropertyId: m.location?.propertyId ?? null, reason, lines: [{ classId: classId || null, head: h }], movement: mv.value(h) })
    const adds = await withScan(planned, scan, (id, files) => attachFiles(ctx.db, 'stock_events', id, files))
    await saveAll([...mv.newContacts, ...adds, ...(await mv.photos(ctx.db, planned))])
    go(`/stock/${m.id}`)
  }

  return (
    <Page title={m.name} kicker="Add stock" back={`/stock/${m.id}`}>
      <p className="mt-3 text-muted">Stock arriving and joining {m.name}{m.location ? ` in ${stock.paddockName(m.location.paddockId, m.location.propertyId)}` : ''}.</p>
      <div className="mt-5 flex flex-col gap-4">
        <Field id="why" label="How they came">
          <Choice value={reason} onChange={setReason} options={[{ value: 'purchase', label: 'Bought' }, { value: 'agistment_in', label: 'Agisted in' }, { value: 'return_from_agistment', label: 'Back home' }]} />
        </Field>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field id="head" label="Head"><input id="head" inputMode="numeric" value={head} onChange={(e) => setHead(e.target.value.replace(/\D/g, ''))} className={inputClass} /></Field>
          <Field id="class" label="Class">
            <select id="class" value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
              <option value="">No class</option>
              {classes.map((c: Row) => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}
            </select>
          </Field>
        </div>
        <ScanUpload scan={scan} onChange={setScan} onUse={(n) => setHead(String(n))} useLabel="Use as the head" />
        <DateField value={date} onChange={setDate} />
        <Section title="Movement details">{mv.fields(reason === 'purchase' ? 'Vendor' : reason === 'agistment_in' ? 'Owner of the stock' : 'Agistor', 'vendor', isOwner, num(head) ?? 0)}</Section>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save}>Add {int(head) || ''} head to {m.name}</Button>
      </div>
    </Page>
  )
}

// ---- Wand scan file --------------------------------------------------------------

export type Scan = { tags: string[]; file: File; repeats: number; unreadable: number }

// Upload the CSV from an RFID wand (or its app): counts the tags once each,
// offers that as the head count, and is kept with the record.
export function ScanUpload({ scan, onChange, onUse, useLabel = 'Use as the count' }: {
  scan: Scan | null; onChange: (s: Scan | null) => void; onUse?: (n: number) => void; useLabel?: string
}) {
  const [problem, setProblem] = useState<string | null>(null)
  async function choose(file: File | undefined) {
    if (!file) return
    const r = parseScan(await file.text())
    if (r.tags.length === 0) { setProblem("No tags found in that file. It needs a column of EIDs (15 digits, e.g. 982 000123456789) or NLIS IDs."); onChange(null); return }
    setProblem(null)
    onChange({ tags: r.tags, file, repeats: r.repeats, unreadable: r.unreadable })
  }
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <div className="text-sm font-semibold">Wand scan file <span className="font-normal text-muted">(optional)</span></div>
      {!scan ? (
        <>
          <p className="mt-0.5 text-xs text-muted">The CSV from your RFID reader or its app (Gallagher, Tru-Test, Datamars, Allflex…). Kept with this record.</p>
          <label className="mt-2 flex h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line text-sm font-semibold text-green-deep">
            Choose file
            <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
          </label>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm"><b>{scan.tags.length} {scan.tags.length === 1 ? 'tag' : 'tags'}</b> in {scan.file.name}
            {scan.repeats > 0 && <span className="text-muted"> · {scan.repeats} repeat {scan.repeats === 1 ? 'scan' : 'scans'} ignored</span>}
            {scan.unreadable > 0 && <span className="text-muted"> · {scan.unreadable} {scan.unreadable === 1 ? 'line' : 'lines'} not a tag</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {onUse && <Button kind="secondary" onClick={() => onUse(scan.tags.length)}>{useLabel} ({scan.tags.length})</Button>}
            <Button kind="quiet" onClick={() => onChange(null)}>Remove</Button>
          </div>
        </>
      )}
      {problem && <p className="mt-2 text-sm text-alert-ink">{problem}</p>}
    </div>
  )
}
