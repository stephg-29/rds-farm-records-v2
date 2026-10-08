// Breeding (mob level): joining, pregnancy testing, marking and weaning.
import { useState, type FormEvent } from 'react'
import type { Row } from '../lib/db'
import { joiningValues, latestJoining, markingPlan } from '../lib/breeding'
import { daysBetween, splitPlan, todayLocal, type WithholdChoice } from '../lib/stock'
import { useFarm } from '../lib/useFarm'
import { useHealth } from '../lib/useHealth'
import { useStock } from '../lib/useStock'
import { useSync, useTable } from '../lib/useSync'
import { Button, Card, Choice, Empty, Field, Notice, Page, Row as ListRow, Section, WarnPopup, go, inputClass, query } from '../ui'
import { WithholdChoiceBox } from './StockActions'
import { DateField, PaddockList, fmtDate } from './stockParts'

const base = '/records/breeding'
const int = (s: string) => { const n = parseInt(s, 10); return Number.isNaN(n) ? null : n }
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const YOUNG: Record<string, string> = { cattle: 'Calves', sheep: 'Lambs', goat: 'Kids' }

export function BreedingHome() {
  const stock = useStock()
  const joinings = useTable('joinings') ?? []
  const tests = useTable('pregnancy_tests') ?? []
  const markings = useTable('birth_markings') ?? []
  const items = [
    ...joinings.map((j) => ({ id: String(j.id), date: String(j.start_date), text: `Joined ${stock.mobName(String(j.mob_id))}${j.sire_mob_id ? ` with ${stock.mobName(String(j.sire_mob_id))}` : j.sire_description ? ` with ${j.sire_description}` : ''}`, detail: j.expected_birth_start ? `Due ${fmtDate(String(j.expected_birth_start))}${j.expected_birth_end && j.expected_birth_end !== j.expected_birth_start ? ` to ${fmtDate(String(j.expected_birth_end))}` : ''}` : '', path: `${base}/joinings/${j.id}` })),
    ...tests.map((t) => ({ id: String(t.id), date: String(t.test_date), text: `Preg tested ${stock.mobName(String(t.mob_id))}`, detail: [t.pregnant != null ? `${t.pregnant} pregnant` : null, t.empty != null ? `${t.empty} empty` : null, t.head_tested ? `of ${t.head_tested}` : null].filter(Boolean).join(' · '), path: `${base}/pregtests/${t.id}` })),
    ...markings.map((m) => ({ id: String(m.id), date: String(m.marking_date), text: 'Marked', detail: `${m.males ?? 0} males, ${m.females ?? 0} females`, path: `${base}/markings/${m.id}` })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <Page title="Breeding" kicker="Stock" back="/stock">
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button onClick={() => go(`${base}/joinings/new`)}>Joining</Button>
        <Button kind="secondary" onClick={() => go(`${base}/pregtests/new`)}>Pregnancy test</Button>
        <Button kind="secondary" onClick={() => go(`${base}/marking`)}>Marking</Button>
        <Button kind="secondary" onClick={() => go(`${base}/weaning`)}>Weaning</Button>
      </div>
      <Section title="Records">
        {items.length === 0 ? <Empty>No breeding records yet.</Empty> : (
          <Card>{items.map((i) => <ListRow key={i.id} onClick={() => go(i.path)} label={i.text} detail={`${fmtDate(i.date)}${i.detail ? ` · ${i.detail}` : ''}`} />)}</Card>
        )}
      </Section>
    </Page>
  )
}

function MobSelect({ value, onChange, label = 'Mob', filter }: { value: string; onChange: (v: string) => void; label?: string; filter?: (m: { species: string }) => boolean }) {
  const stock = useStock()
  return (
    <Field id="mob" label={label}>
      <select id="mob" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">Choose a mob</option>
        {stock.mobs.filter((m) => m.head > 0 && (!filter || filter(m))).map((m) => <option key={m.id} value={m.id}>{m.name} · {m.head} hd</option>)}
      </select>
    </Field>
  )
}

function DeleteButton({ table, id, back }: { table: string; id: string; back: string }) {
  const { remove } = useSync()
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="mt-8">
      {confirm ? (
        <div className="flex gap-2">
          <Button kind="danger" className="flex-1" onClick={async () => { await remove(table, id); go(back) }}>Yes, delete it</Button>
          <Button kind="secondary" onClick={() => setConfirm(false)}>Keep</Button>
        </div>
      ) : <Button kind="danger" className="w-full" onClick={() => setConfirm(true)}>Delete this record</Button>}
    </div>
  )
}

// ---- Joining -------------------------------------------------------------------------

export function JoiningScreen({ id }: { id?: string }) {
  const joinings = useTable('joinings')
  if (!joinings) return null
  const j = id ? joinings.find((x) => x.id === id) : undefined
  return <JoiningForm key={id ?? 'new'} j={j} />
}

function JoiningForm({ j }: { j?: Row }) {
  const stock = useStock()
  const allJoinings = useTable('joinings') ?? []
  const { settings } = useFarm()
  const { add, edit } = useSync()
  const [mobPick, setMob] = useState(str(j?.mob_id) || query().get('mob') || '')
  const mob = stock.mob(mobPick)
  const [sireMob, setSireMob] = useState(str(j?.sire_mob_id))
  const [sireText, setSireText] = useState(str(j?.sire_description))
  const [paddock, setPaddock] = useState(str(j?.paddock_id))
  const [start, setStart] = useState(str(j?.start_date) || todayLocal())
  const [end, setEnd] = useState(str(j?.end_date))
  const [notes, setNotes] = useState(str(j?.notes))
  const [error, setError] = useState<string | null>(null)
  const gestation = settings?.gestation_days as Record<string, number> | undefined
  const values = mob ? joiningValues({ mobId: mob.id, species: mob.species, sireMobId: sireMob || null, sireDescription: sireText, paddockId: paddock || mob.location?.paddockId || null, start, end: end || null, notes }, gestation) : null

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!values) return setError('Choose the mob being joined.')
    if (j) await edit('joinings', String(j.id), values)
    else await add('joinings', values)
    go(base)
  }
  return (
    <Page title={j ? 'Joining' : 'New joining'} kicker="Breeding" back={base}>
      {(() => {
        // An earlier joining for this mob in the last 10 months: maybe another bull going in.
        const prev = !j && mob ? latestJoining(allJoinings.filter((x) => !x.deleted_at), mob.id) : null
        const recent = prev && daysBetween(String(prev.start_date), todayLocal()) <= 300
        return (
          <WarnPopup show={!!recent} warnKey={String(prev?.id ?? '')} title="Already has a joining">
            <b>{mob?.name}</b> already has a joining from {fmtDate(String(prev?.start_date ?? ''), { day: 'numeric', month: 'short', year: 'numeric' })}{prev?.sire_description ? ` (${prev.sire_description})` : ''}. That's fine if another sire is going in: save this one as well.
          </WarnPopup>
        )
      })()}
      <form onSubmit={save} className="mt-5 flex flex-col gap-4">
        <MobSelect value={mobPick} onChange={setMob} label="Mob joined" />
        <Field id="sire" label="Sires (a mob)">
          <select id="sire" value={sireMob} onChange={(e) => setSireMob(e.target.value)} className={inputClass}>
            <option value="">None or not in the app</option>
            {stock.mobs.filter((m) => m.id !== mobPick && m.head > 0 && (!mob || m.species === mob.species)).map((m) => <option key={m.id} value={m.id}>{m.name} · {m.head} hd</option>)}
          </select>
        </Field>
        <Field id="sireText" label="Or describe the sires"><input id="sireText" value={sireText} onChange={(e) => setSireText(e.target.value)} className={inputClass} placeholder="e.g. 3 Angus bulls" /></Field>
        <Field id="pdk" label="Paddock"><select id="pdk" value={paddock} onChange={(e) => setPaddock(e.target.value)} className={inputClass}><option value="">Where the mob is</option>{stock.paddocks.map((d) => <option key={String(d.id)} value={String(d.id)}>{String(d.name)}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <DateField value={start} onChange={setStart} />
          <Field id="end" label="Sires out"><input id="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} /></Field>
        </div>
        {!!values?.expected_birth_start && <Notice tone="info">{YOUNG[mob!.species] ?? 'Young'} due from {fmtDate(String(values.expected_birth_start), { day: 'numeric', month: 'short', year: 'numeric' })}{values.expected_birth_end !== values.expected_birth_start ? ` to ${fmtDate(String(values.expected_birth_end), { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.</Notice>}
        <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button type="submit">Save joining</Button>
      </form>
      {j && <DeleteButton table="joinings" id={String(j.id)} back={base} />}
    </Page>
  )
}

// ---- Pregnancy test ------------------------------------------------------------------------

export function PregTestScreen({ id }: { id?: string }) {
  const tests = useTable('pregnancy_tests')
  if (!tests) return null
  const t = id ? tests.find((x) => x.id === id) : undefined
  return <PregTestForm key={id ?? 'new'} t={t} />
}

function PregTestForm({ t }: { t?: Row }) {
  const stock = useStock()
  const joinings = useTable('joinings') ?? []
  const { add, edit } = useSync()
  const [mobPick, setMob] = useState(str(t?.mob_id) || query().get('mob') || '')
  const mob = stock.mob(mobPick)
  const [date, setDate] = useState(str(t?.test_date) || todayLocal())
  const [tester, setTester] = useState(str(t?.tester_name))
  const f = (k: string) => str(t?.[k])
  const [v, setV] = useState<Record<string, string>>({ head_tested: f('head_tested'), pregnant: f('pregnant'), empty: f('empty'), early: f('early'), mid: f('mid'), late: f('late'), singles: f('singles'), twins: f('twins'), multiples: f('multiples') })
  const [notes, setNotes] = useState(str(t?.notes))
  const set = (k: string, val: string) => setV({ ...v, [k]: val.replace(/\D/g, '') })
  const box = (k: string, label: string) => <Field id={k} label={label}><input id={k} inputMode="numeric" value={v[k]} onChange={(e) => set(k, e.target.value)} className={inputClass} /></Field>

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!mob) return
    const values = {
      mob_id: mob.id, joining_id: latestJoining(joinings, mob.id)?.id ?? null, test_date: date, tester_name: tester.trim() || null,
      ...Object.fromEntries(Object.entries(v).map(([k, val]) => [k, int(val)])), head_tested: int(v.head_tested) ?? mob.head, notes: notes.trim() || null,
    }
    if (t) await edit('pregnancy_tests', String(t.id), values)
    else await add('pregnancy_tests', values)
    go(base)
  }
  return (
    <Page title="Pregnancy test" kicker="Breeding" back={base}>
      <form onSubmit={save} className="mt-5 flex flex-col gap-4">
        <MobSelect value={mobPick} onChange={setMob} />
        <div className="grid grid-cols-2 gap-3"><DateField value={date} onChange={setDate} /><Field id="tester" label="Tested by"><input id="tester" value={tester} onChange={(e) => setTester(e.target.value)} className={inputClass} /></Field></div>
        <div className="grid grid-cols-3 gap-2">{box('head_tested', 'Tested')}{box('pregnant', 'Pregnant')}{box('empty', 'Empty')}</div>
        <div className="grid grid-cols-3 gap-2">{box('early', 'Early')}{box('mid', 'Mid')}{box('late', 'Late')}</div>
        {mob && mob.species !== 'cattle' && <div className="grid grid-cols-3 gap-2">{box('singles', 'Singles')}{box('twins', 'Twins')}{box('multiples', 'Multiples')}</div>}
        <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
        <Button type="submit" disabled={!mob}>Save test</Button>
      </form>
      {t && <DeleteButton table="pregnancy_tests" id={String(t.id)} back={base} />}
    </Page>
  )
}

// ---- Marking ----------------------------------------------------------------------------------

export function MarkingScreen({ id }: { id?: string }) {
  const stock = useStock()
  const markings = useTable('birth_markings')
  const joinings = useTable('joinings') ?? []
  const { saveAll } = useSync()
  const [mobPick, setMob] = useState(query().get('mob') ?? '')
  const mob = stock.mob(mobPick)
  const young = mob ? stock.classes.find((c) => c.species === mob.species && c.name === YOUNG[mob.species]) : undefined
  const [classPick, setClass] = useState('')
  const classId = classPick || String(young?.id ?? '')
  const [males, setMales] = useState('')
  const [females, setFemales] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [notes, setNotes] = useState('')
  if (!markings || !stock.ready) return null
  if (id) {
    const m = markings.find((x) => x.id === id)
    if (!m) return <Page title="Not found" back={base}><p className="mt-4 text-muted">That record isn't on this phone.</p></Page>
    return (
      <Page title="Marking" kicker="Breeding" back={base}>
        <p className="mt-3 text-muted">{fmtDate(String(m.marking_date), { day: 'numeric', month: 'short', year: 'numeric' })} · {String(m.males ?? 0)} males, {String(m.females ?? 0)} females{m.notes ? ` · ${m.notes}` : ''}</p>
        <p className="mt-3 text-sm text-muted">The head were added to the mob. To correct the numbers, delete the "Marked" entry in the mob's history and mark again.</p>
      </Page>
    )
  }
  async function save() {
    if (!mob) return
    await saveAll(markingPlan({ mobId: mob.id, date, joiningId: latestJoining(joinings, mob.id)?.id as string | null ?? null, males: int(males) ?? 0, females: int(females) ?? 0, maleClassId: classId || null, femaleClassId: classId || null, notes }))
    go(`/stock/${mob.id}`)
  }
  return (
    <Page title="Marking" kicker="Breeding" back={base}>
      <p className="mt-3 text-muted">The young are added to the mob they're with (e.g. cows and calves), and counted for the reconciliation as births.</p>
      <div className="mt-5 flex flex-col gap-4">
        <MobSelect value={mobPick} onChange={setMob} label="Mob (mothers)" />
        <div className="grid grid-cols-2 gap-3">
          <Field id="males" label="Males"><input id="males" inputMode="numeric" value={males} onChange={(e) => setMales(e.target.value.replace(/\D/g, ''))} className={inputClass} /></Field>
          <Field id="females" label="Females"><input id="females" inputMode="numeric" value={females} onChange={(e) => setFemales(e.target.value.replace(/\D/g, ''))} className={inputClass} /></Field>
        </div>
        <Field id="class" label="Counted as">
          <select id="class" value={classId} onChange={(e) => setClass(e.target.value)} className={inputClass}>
            <option value="">No class</option>
            {stock.classes.filter((c) => !mob || c.species === mob.species).map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}
          </select>
        </Field>
        <DateField value={date} onChange={setDate} />
        <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
        <Button onClick={save} disabled={!mob || (int(males) ?? 0) + (int(females) ?? 0) === 0}>Add {(int(males) ?? 0) + (int(females) ?? 0) || ''} marked</Button>
      </div>
    </Page>
  )
}

// ---- Weaning --------------------------------------------------------------------------------------

export function WeaningScreen() {
  const stock = useStock()
  const health = useHealth(stock.mobName)
  const { saveAll } = useSync()
  const [mobPick, setMob] = useState(query().get('mob') ?? '')
  const mob = stock.mob(mobPick)
  const [name, setName] = useState('')
  const [heads, setHeads] = useState<Record<string, string>>({})
  const [stay, setStay] = useState(false)
  const [to, setTo] = useState<{ propertyId: string; paddockId: string | null } | null>(null)
  const [choice, setChoice] = useState<WithholdChoice>(null)
  const [date, setDate] = useState(todayLocal())
  const [error, setError] = useState<string | null>(null)
  const active = mob ? health.active.get(mob.id) : undefined
  if (!stock.ready) return null

  async function save() {
    if (!mob) return setError('Choose the mob the young are in.')
    if (!name.trim()) return setError('Name the weaner mob.')
    const lines = Object.entries(heads).map(([k, h]) => ({ classId: k === 'none' ? null : k, head: int(h) ?? 0 })).filter((l) => l.head > 0)
    if (lines.length === 0) return setError('How many are being weaned?')
    if (!stay && !to) return setError('Choose where the weaners go.')
    if (active && !choice) return setError('Choose whether the withhold applies to the weaners.')
    const place = stay ? mob.location : to
    const plan = splitPlan({ sourceMobId: mob.id, date, eventType: 'weaning', parts: [{ newMob: { name: name.trim(), species: mob.species }, lines, withholdChoice: active ? choice : null, to: place ? { propertyId: place.propertyId, paddockId: place.paddockId } : null }] })
    await saveAll(plan.adds)
    go(`/stock/${plan.mobIds[0]}`)
  }

  return (
    <Page title="Weaning" kicker="Breeding" back={base}>
      <p className="mt-3 text-muted">The young come off into a new weaner mob. Their treatment history goes with them.</p>
      <div className="mt-5 flex flex-col gap-4">
        <MobSelect value={mobPick} onChange={(v) => { setMob(v); setHeads({}) }} label="Weaning from" />
        <Field id="name" label="Weaner mob name"><input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. 2027 weaners" /></Field>
        {mob && (
          <div className="flex flex-col gap-2">
            {mob.classes.map((c) => (
              <div key={c.id ?? 'none'} className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-2">
                <span className="flex-1"><span className="block font-medium">{c.name}</span><span className="text-xs text-muted">{c.head} in the mob</span></span>
                <input aria-label={`${c.name} weaned`} inputMode="numeric" value={heads[c.id ?? 'none'] ?? ''} onChange={(e) => setHeads({ ...heads, [c.id ?? 'none']: e.target.value.replace(/\D/g, '') })} placeholder="0" className="h-11 w-20 rounded-lg border border-line bg-paper text-center text-lg" />
              </div>
            ))}
          </div>
        )}
        {active && <WithholdChoiceBox active={active} value={choice} onChange={setChoice} toName={name || 'the weaners'} />}
        <Field id="where" label="Weaners go to"><Choice value={stay ? 'stay' : 'move'} onChange={(v) => setStay(v === 'stay')} options={[{ value: 'move', label: 'Another paddock' }, { value: 'stay', label: 'The same paddock' }]} /></Field>
        {!stay && <PaddockList stock={stock} value={to} onChange={setTo} exclude={mob?.location} />}
        <DateField value={date} onChange={setDate} />
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save}>Wean</Button>
      </div>
    </Page>
  )
}
