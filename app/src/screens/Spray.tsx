// Spray records, with the fields the NSW Pesticides Regulation 2017 asks for.
// Owners and staff record their own; contractors record against their job.
import { useState } from 'react'
import type { Row } from '../lib/db'
import { fmtQty } from '../lib/chem'
import { sprayPlan, type SprayItemInput } from '../lib/land'
import { todayLocal } from '../lib/stock'
import { useFarm } from '../lib/useFarm'
import { useHealth } from '../lib/useHealth'
import { useStock } from '../lib/useStock'
import { useSync, useTable } from '../lib/useSync'
import { addDays } from '../lib/withholds'
import { Button, Card, Empty, Field, Notice, Page, Section, go, inputClass, query } from '../ui'
import { PaddockMultiPick, areaOf } from './landParts'
import { DateField, fmtDate } from './stockParts'

const num = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() === '' || Number.isNaN(n) ? null : n }
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

type ItemForm = { key: string; id?: string; productId: string; productName: string; batchId: string; batchNumber: string; expiry: string; rate: string; used: string; grazing: string; harvest: string }
const emptyItem = (): ItemForm => ({ key: crypto.randomUUID(), productId: '', productName: '', batchId: '', batchNumber: '', expiry: '', rate: '', used: '', grazing: '', harvest: '' })

export function SprayList() {
  const sprays = useTable('spray_records')
  const links = useTable('spray_record_paddocks') ?? []
  const paddocks = useTable('paddocks') ?? []
  const list = [...(sprays ?? [])].sort((a, b) => String(b.spray_date).localeCompare(String(a.spray_date)))
  const today = todayLocal()
  return (
    <Page title="Spray records" kicker="Records" back="/records" action={<Button className="shrink-0" onClick={() => go('/records/spray/new')}>Record</Button>}>
      <p className="mt-3 text-muted">Newest first. Paddocks under a grazing withhold show in red on the map.</p>
      <div className="mt-5">
        {sprays && list.length === 0 && <Empty>No spray records yet.</Empty>}
        {list.length > 0 && (
          <Card>
            {list.map((s) => {
              const names = links.filter((l) => l.spray_record_id === s.id).map((l) => String(paddocks.find((d) => d.id === l.paddock_id)?.name ?? '')).filter(Boolean)
              const whp = !!s.grazing_withhold_until && String(s.grazing_withhold_until) >= today
              return (
                <button key={String(s.id)} onClick={() => go(`/records/spray/${s.id}`)} className="flex w-full gap-4 px-4 py-3 text-left active:bg-paper">
                  <span className="w-14 shrink-0 text-sm text-muted">{fmtDate(String(s.spray_date))}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{String(s.target || 'Spray')}{s.contractor_entered ? ' · by contractor' : ''}</span>
                    <span className="block text-sm text-muted">{names.join(', ')}</span>
                    {whp && <span className="mt-1 inline-block rounded-full bg-alert-soft px-2 py-0.5 text-xs font-semibold text-alert-ink">Don't graze until {fmtDate(String(s.grazing_withhold_until))}</span>}
                  </span>
                </button>
              )
            })}
          </Card>
        )}
      </div>
    </Page>
  )
}

export function SprayScreen({ id }: { id?: string }) {
  const sprays = useTable('spray_records')
  const links = useTable('spray_record_paddocks')
  const items = useTable('spray_record_items')
  const jobs = useTable('jobs')
  const jobLinks = useTable('job_paddocks')
  if (!sprays || !links || !items || !jobs || !jobLinks) return null
  const existing = id ? sprays.find((s) => s.id === id) : undefined
  if (id && !existing) return <Page title="Not found" back="/records/spray"><p className="mt-4 text-muted">That record has been deleted or isn't on this phone.</p></Page>
  const jobId = String(existing?.job_id ?? query().get('job') ?? '')
  const job = jobs.find((j) => j.id === jobId)
  return <SprayForm key={id ?? 'new'} existing={existing} links={links} items={items} job={job} jobPaddocks={job ? jobLinks.filter((l) => l.job_id === job.id).map((l) => String(l.paddock_id)) : undefined} />
}

function SprayForm({ existing, links, items: allItems, job, jobPaddocks }: { existing?: Row; links: Row[]; items: Row[]; job?: Row; jobPaddocks?: string[] }) {
  const stock = useStock()
  const health = useHealth(stock.mobName)
  const { me } = useFarm()
  const { saveAll, remove } = useSync()
  const contractor = me?.role === 'contractor'
  const paddocks = useTable('paddocks') ?? []
  const properties = useTable('properties') ?? []
  const myItems = existing ? allItems.filter((i) => i.spray_record_id === existing.id) : []
  const [date, setDate] = useState(str(existing?.spray_date) || todayLocal())
  const [start, setStart] = useState(str(existing?.start_time).slice(0, 5))
  const [finish, setFinish] = useState(str(existing?.finish_time).slice(0, 5))
  const [propertyPick, setPropertyId] = useState(str(existing?.property_id ?? job?.property_id))
  const propertyId = propertyPick || String(properties[0]?.id ?? '')
  const [pids, setPids] = useState<string[]>(existing ? links.filter((l) => l.spray_record_id === existing.id).map((l) => String(l.paddock_id)) : jobPaddocks ?? [])
  const [situation, setSituation] = useState(str(existing?.situation) || 'Pasture')
  const [target, setTarget] = useState(str(existing?.target))
  const [water, setWater] = useState(str(existing?.water_rate))
  const [area, setArea] = useState(str(existing?.area_ha))
  const [wind, setWind] = useState(str(existing?.wind_speed_direction))
  const [temp, setTemp] = useState(str(existing?.temperature_c))
  const [humidity, setHumidity] = useState(str(existing?.humidity_delta_t))
  const [equipment, setEquipment] = useState(str(existing?.equipment))
  const [applicator, setApplicator] = useState(str(existing?.applicator_name) || str(me?.full_name))
  const [licence, setLicence] = useState(str(existing?.licence_number))
  const [notes, setNotes] = useState(str(existing?.notes))
  const [reason, setReason] = useState('')
  const [items, setItems] = useState<ItemForm[]>(() => myItems.length ? myItems.map((i) => ({
    key: String(i.id), id: String(i.id), productId: str(i.product_id) || (i.product_name ? 'new' : ''), productName: str(i.product_name), batchId: str(i.batch_id),
    batchNumber: str(i.batch_number), expiry: str(i.expiry_date), rate: str(i.application_rate), used: str(i.quantity_used), grazing: str(i.grazing_whp_days), harvest: str(i.harvest_whp_days),
  })) : [emptyItem()])
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const products = health.products.filter((p) => ['spray', 'other'].includes(String(p.product_kind)) && !p.archived_at).sort((a, b) => String(a.name).localeCompare(String(b.name)))
  const update = (key: string, c: Partial<ItemForm>) => setItems((l) => l.map((i) => (i.key === key ? { ...i, ...c } : i)))
  const back = contractor && job ? `/jobs/${job.id}` : '/records/spray'
  const mapped = areaOf(paddocks, pids)
  const grazingDays = items.map((i) => num(i.grazing)).filter((x): x is number => x !== null)

  async function save() {
    if (pids.length === 0) return setError('Tick the paddocks sprayed.')
    const inputs: SprayItemInput[] = []
    for (const i of items) {
      if (!i.productId) return setError('Choose each product (or remove the empty one).')
      if (i.productId === 'new' && !i.productName.trim()) return setError('Type the product name.')
      inputs.push({
        id: i.id, productId: i.productId === 'new' ? null : i.productId, productName: i.productId === 'new' ? i.productName : null,
        batchId: i.productId !== 'new' && i.batchId ? i.batchId : null, batchNumber: i.batchNumber, expiryDate: i.expiry || null,
        rate: i.rate, quantityUsed: num(i.used), grazingWhpDays: num(i.grazing), harvestWhpDays: num(i.harvest),
      })
    }
    const plan = sprayPlan({
      id: existing ? String(existing.id) : undefined, date, startTime: start, finishTime: finish, propertyId, paddockIds: pids,
      situation, target, waterRate: water, areaHa: num(area) ?? (mapped || null), wind, temperatureC: num(temp), humidity, equipment,
      applicatorUserId: existing ? (existing.applicator_user_id as string | null) : me ? String(me.user_id) : null,
      applicatorName: applicator, licence, jobId: job ? String(job.id) : null, contractorEntered: existing ? !!existing.contractor_entered : contractor, notes, items: inputs,
    }, { paddocks: links, items: allItems }, reason.trim() || undefined)
    await saveAll(plan.adds, plan.edits)
    go(back)
  }

  return (
    <Page title={existing ? 'Spray record' : 'Record spraying'} kicker={job ? 'Contractor job' : 'Spray records'} back={back}>
      <div className="mt-5 flex flex-col gap-4">
        <DateField value={date} onChange={setDate} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="start" label="Started"><input id="start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} /></Field>
          <Field id="finish" label="Finished"><input id="finish" type="time" value={finish} onChange={(e) => setFinish(e.target.value)} className={inputClass} /></Field>
        </div>
        {!job && properties.length > 1 && (
          <Field id="prop" label="Property">
            <select id="prop" value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setPids([]) }} className={inputClass}>{properties.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}</select>
          </Field>
        )}
        <div>
          <div className="mb-2 text-sm font-semibold text-muted">Paddocks sprayed</div>
          <PaddockMultiPick paddocks={paddocks} propertyId={propertyId} value={pids} onChange={setPids} limitTo={jobPaddocks}
            stockIn={contractor ? undefined : (pid) => (stock.mobs.some((m) => m.head > 0 && m.location?.paddockId === pid) ? 'stock in' : null)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="situation" label="Situation"><input id="situation" value={situation} onChange={(e) => setSituation(e.target.value)} className={inputClass} placeholder="Pasture, crop…" /></Field>
          <Field id="target" label="Target"><input id="target" value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass} placeholder="e.g. Thistles" /></Field>
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-xl text-green-deep">Products in the mix</h2>
      <div className="flex flex-col gap-3">
        {items.map((i) => {
          const view = health.chem.find((p) => p.id === i.productId)
          return (
            <div key={i.key} className="rounded-2xl border border-line bg-card p-4">
              <Field id={`p-${i.key}`} label="Product">
                <select id={`p-${i.key}`} value={i.productId} onChange={(e) => {
                  const p = products.find((x) => x.id === e.target.value)
                  const v = health.chem.find((x) => x.id === e.target.value)
                  update(i.key, { productId: e.target.value, batchId: v?.batches.find((b) => b.onHand > 0)?.id ?? '', grazing: str(p?.label_grazing_whp_days), harvest: str(p?.label_harvest_whp_days), rate: str(p?.default_dose_rate) })
                }} className={inputClass}>
                  <option value="">Choose a product</option>
                  {products.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}
                  <option value="new">Not in the list (type it in)</option>
                </select>
              </Field>
              {i.productId === 'new' && <div className="mt-3"><Field id={`n-${i.key}`} label="Product name"><input id={`n-${i.key}`} value={i.productName} onChange={(e) => update(i.key, { productName: e.target.value })} className={inputClass} /></Field></div>}
              {view && view.row.track_stock !== false && view.batches.length > 0 && (
                <div className="mt-3">
                  <Field id={`b-${i.key}`} label="From">
                    <select id={`b-${i.key}`} value={i.batchId} onChange={(e) => update(i.key, { batchId: e.target.value })} className={inputClass}>
                      {view.batches.map((b) => <option key={b.id} value={b.id}>Batch {b.batchNumber ?? '(no number)'} · {fmtQty(b.onHand, view.unit)}</option>)}
                      <option value="">Not from the shed</option>
                    </select>
                  </Field>
                </div>
              )}
              {(i.productId === 'new' || (i.productId && !i.batchId)) && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Field id={`bn-${i.key}`} label="Batch no."><input id={`bn-${i.key}`} value={i.batchNumber} onChange={(e) => update(i.key, { batchNumber: e.target.value })} className={inputClass} /></Field>
                  <Field id={`ex-${i.key}`} label="Expiry"><input id={`ex-${i.key}`} type="date" value={i.expiry} onChange={(e) => update(i.key, { expiry: e.target.value })} className={inputClass} /></Field>
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Field id={`r-${i.key}`} label="Rate"><input id={`r-${i.key}`} value={i.rate} onChange={(e) => update(i.key, { rate: e.target.value })} className={inputClass} placeholder="e.g. 1.5 L/ha" /></Field>
                <Field id={`u-${i.key}`} label={`Used${view ? ` (${view.unit})` : ''}`}><input id={`u-${i.key}`} inputMode="decimal" value={i.used} onChange={(e) => update(i.key, { used: e.target.value })} className={inputClass} /></Field>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Field id={`g-${i.key}`} label="Grazing WHP (days)"><input id={`g-${i.key}`} inputMode="numeric" value={i.grazing} onChange={(e) => update(i.key, { grazing: e.target.value.replace(/\D/g, '') })} className={inputClass} /></Field>
                <Field id={`h-${i.key}`} label="Harvest WHP (days)"><input id={`h-${i.key}`} inputMode="numeric" value={i.harvest} onChange={(e) => update(i.key, { harvest: e.target.value.replace(/\D/g, '') })} className={inputClass} /></Field>
              </div>
              {items.length > 1 && <button onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))} className="mt-3 text-sm font-medium text-alert underline">Remove this product</button>}
            </div>
          )
        })}
      </div>
      <Button kind="secondary" className="mt-3 w-full" onClick={() => setItems((l) => [...l, emptyItem()])}>+ Another product</Button>
      {grazingDays.length > 0 && <div className="mt-3"><Notice tone="alert">Don't graze these paddocks until {fmtDate(addDays(date, Math.max(...grazingDays)), { weekday: 'short', day: 'numeric', month: 'short' })}. Grazable the day after.</Notice></div>}

      <Section title="Conditions and applicator">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field id="water" label="Water rate"><input id="water" value={water} onChange={(e) => setWater(e.target.value)} className={inputClass} placeholder="e.g. 80 L/ha" /></Field>
            <Field id="area" label="Area (ha)" hint={mapped && !area ? `Paddocks: ${mapped} ha` : undefined}><input id="area" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} className={inputClass} placeholder={mapped ? String(mapped) : ''} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="wind" label="Wind speed and direction"><input id="wind" value={wind} onChange={(e) => setWind(e.target.value)} className={inputClass} placeholder="e.g. 8 km/h NE" /></Field>
            <Field id="temp" label="Temperature (°C)"><input id="temp" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} className={inputClass} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="hum" label="Humidity or delta T"><input id="hum" value={humidity} onChange={(e) => setHumidity(e.target.value)} className={inputClass} /></Field>
            <Field id="equip" label="Equipment"><input id="equip" value={equipment} onChange={(e) => setEquipment(e.target.value)} className={inputClass} placeholder="e.g. Boom spray" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="appl" label="Applicator"><input id="appl" value={applicator} onChange={(e) => setApplicator(e.target.value)} className={inputClass} /></Field>
            <Field id="lic" label="Licence no."><input id="lic" value={licence} onChange={(e) => setLicence(e.target.value)} className={inputClass} /></Field>
          </div>
          <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
          {existing && <Field id="why" label="Reason for the change (optional)"><input id="why" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} /></Field>}
          {error && <Notice tone="alert">{error}</Notice>}
          <Button onClick={save}>{existing ? 'Save changes' : 'Save spray record'}</Button>
          <p className="text-xs text-muted">Fields follow the NSW Pesticides Regulation 2017 record (record within 48 hours, keep 3 years). Check current requirements for your state.</p>
        </div>
      </Section>
      {existing && (
        <div className="mt-8">
          {confirm ? (
            <div className="flex gap-2">
              <Button kind="danger" className="flex-1" onClick={async () => { await remove('spray_records', String(existing.id), reason.trim() || undefined); go(back) }}>Yes, delete it</Button>
              <Button kind="secondary" onClick={() => setConfirm(false)}>Keep</Button>
            </div>
          ) : <Button kind="danger" className="w-full" onClick={() => setConfirm(true)}>Delete this record</Button>}
        </div>
      )}
    </Page>
  )
}
