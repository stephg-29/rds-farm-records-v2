// Vehicle maintenance (as in v1): vehicles, services with tick-box work done,
// next service due, cost (owners) and photos of invoices.
import { useRef, useState, type FormEvent } from 'react'
import type { Row } from '../lib/db'
import { attachFiles, useAttachments } from '../lib/files'
import { todayLocal } from '../lib/stock'
import { useFarm } from '../lib/useFarm'
import { useSync, useTable } from '../lib/useSync'
import { Button, Card, Choice, Empty, Field, Page, Row as ListRow, Section, go, inputClass, nowIso } from '../ui'
import { Photo } from './Issues'
import { DateField, fmtDate } from './stockParts'

const base = '/records/vehicles'
const num = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() === '' || Number.isNaN(n) ? null : n }
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

function lastService(services: Row[], vehicleId: string) {
  return services.filter((s) => s.vehicle_id === vehicleId).sort((a, b) => String(b.service_date).localeCompare(String(a.service_date)))[0]
}

export function VehicleList() {
  const vehicles = (useTable('vehicles') ?? []).filter((v) => !v.archived_at)
  const services = useTable('vehicle_services') ?? []
  const today = todayLocal()
  return (
    <Page title="Vehicles" kicker="More" back="/more" action={<Button className="shrink-0" onClick={() => go(`${base}/new`)}>Add</Button>}>
      <div className="mt-5">
        {vehicles.length === 0 ? <Empty>No vehicles yet. Add the ute, tractor, quad and so on.</Empty> : (
          <Card>
            {vehicles.map((v) => {
              const s = lastService(services, String(v.id))
              const due = s?.next_due_date ? String(s.next_due_date) : null
              return (
                <ListRow key={String(v.id)} onClick={() => go(`${base}/${v.id}`)} label={String(v.name)}
                  detail={<>{s ? `Last service ${fmtDate(String(s.service_date))}${s.reading ? ` at ${s.reading} ${v.reading_unit}` : ''}` : 'No services yet'}
                    {(due || s?.next_due_reading) && <span className={due && due <= today ? 'text-alert' : ''}> · next {due ? fmtDate(due) : ''}{s?.next_due_reading ? `${due ? ' or ' : ''}${s.next_due_reading} ${v.reading_unit}` : ''}</span>}</>} />
              )
            })}
          </Card>
        )}
      </div>
    </Page>
  )
}

export function VehicleScreen({ id }: { id: string }) {
  const vehicles = useTable('vehicles')
  const services = useTable('vehicle_services') ?? []
  if (!vehicles) return null
  const v = vehicles.find((x) => x.id === id)
  if (!v) return <Page title="Not found" back={base}><p className="mt-4 text-muted">That vehicle isn't on this phone.</p></Page>
  const list = services.filter((s) => s.vehicle_id === id).sort((a, b) => String(b.service_date).localeCompare(String(a.service_date)))
  return (
    <Page title={String(v.name)} kicker={[v.vehicle_type, v.rego].filter(Boolean).join(' · ') || 'Vehicle'} back={base}
      action={<Button kind="secondary" className="shrink-0 px-4" onClick={() => go(`${base}/${id}/edit`)}>Edit</Button>}>
      <Button className="mt-5 w-full" onClick={() => go(`${base}/${id}/service`)}>Record a service</Button>
      <Section title="Services">
        {list.length === 0 ? <Empty>No services recorded yet.</Empty> : (
          <Card>
            {list.map((s) => (
              <ListRow key={String(s.id)} onClick={() => go(`${base}/${id}/service/${s.id}`)} label={`${String(s.service_type ?? 'Service')}${s.reading ? ` · ${s.reading} ${v.reading_unit}` : ''}`}
                detail={`${fmtDate(String(s.service_date))}${(s.work_done as string[]).length ? ` · ${(s.work_done as string[]).join(', ')}` : ''}`} />
            ))}
          </Card>
        )}
      </Section>
    </Page>
  )
}

export function VehicleFormScreen({ id }: { id?: string }) {
  const vehicles = useTable('vehicles')
  const { add, edit } = useSync()
  const v = id ? vehicles?.find((x) => x.id === id) : undefined
  const [name, setName] = useState(str(v?.name))
  const [type, setType] = useState(str(v?.vehicle_type))
  const [rego, setRego] = useState(str(v?.rego))
  const [serial, setSerial] = useState(str(v?.serial_number))
  const [unit, setUnit] = useState<'km' | 'hours'>((v?.reading_unit as 'km') ?? 'km')
  const [notes, setNotes] = useState(str(v?.notes))
  if (!vehicles) return null
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const values = { name: name.trim(), vehicle_type: type.trim() || null, rego: rego.trim().toUpperCase() || null, serial_number: serial.trim() || null, reading_unit: unit, notes: notes.trim() || null }
    if (v) { await edit('vehicles', String(v.id), values); go(`${base}/${v.id}`) }
    else { const nid = await add('vehicles', values); go(`${base}/${nid}`) }
  }
  return (
    <Page title={v ? `Edit ${str(v.name)}` : 'New vehicle'} kicker="Vehicles" back={v ? `${base}/${v.id}` : base}>
      <form onSubmit={save} className="mt-5 flex flex-col gap-4">
        <Field id="name" label="Name"><input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Hilux" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="type" label="Type"><input id="type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass} placeholder="Ute, tractor…" /></Field>
          <Field id="rego" label="Rego"><input id="rego" value={rego} onChange={(e) => setRego(e.target.value)} className={inputClass} /></Field>
        </div>
        <Field id="serial" label="Serial or VIN"><input id="serial" value={serial} onChange={(e) => setSerial(e.target.value)} className={inputClass} /></Field>
        <Field id="unit" label="Measured in"><Choice value={unit} onChange={setUnit} options={[{ value: 'km', label: 'km' }, { value: 'hours', label: 'Hours' }]} /></Field>
        <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
        <Button type="submit">Save</Button>
      </form>
      {v && <Button kind="danger" className="mt-10 w-full" onClick={() => { edit('vehicles', String(v.id), { archived_at: nowIso() }); go(base) }}>Archive (sold or scrapped)</Button>}
    </Page>
  )
}

export function ServiceScreen({ vehicleId, id }: { vehicleId: string; id?: string }) {
  const vehicles = useTable('vehicles')
  const services = useTable('vehicle_services')
  const prices = useTable('record_prices') ?? []
  if (!vehicles || !services) return null
  const v = vehicles.find((x) => x.id === vehicleId)
  const s = id ? services.find((x) => x.id === id) : undefined
  if (!v || (id && !s)) return <Page title="Not found" back={base}><p className="mt-4 text-muted">That record isn't on this phone.</p></Page>
  return <ServiceForm key={id ?? 'new'} v={v} s={s} price={s ? prices.find((p) => p.record_table === 'vehicle_services' && p.record_id === s.id) : undefined} />
}

function ServiceForm({ v, s, price }: { v: Row; s?: Row; price?: Row }) {
  const { saveAll, remove, ctx } = useSync()
  const { isOwner } = useFarm()
  const lists = useTable('pick_lists') ?? []
  const attachments = useAttachments('vehicle_services', s ? String(s.id) : undefined)
  const pick = (name: string) => lists.filter((l) => l.list_name === name && !l.archived_at).sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((l) => String(l.value))
  const [date, setDate] = useState(str(s?.service_date) || todayLocal())
  const [reading, setReading] = useState(str(s?.reading))
  const [type, setType] = useState(str(s?.service_type))
  const [work, setWork] = useState<string[]>((s?.work_done as string[]) ?? [])
  const [other, setOther] = useState(str(s?.work_done_other))
  const [parts, setParts] = useState(str(s?.parts_used))
  const [doneBy, setDoneBy] = useState(str(s?.done_by))
  const [nextDate, setNextDate] = useState(str(s?.next_due_date))
  const [nextReading, setNextReading] = useState(str(s?.next_due_reading))
  const [notes, setNotes] = useState(str(s?.notes))
  const [cost, setCost] = useState(str(price?.total_amount))
  const [files, setFiles] = useState<File[]>([])
  const [confirm, setConfirm] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const back = `${base}/${v.id}`

  async function save() {
    const id = s ? String(s.id) : crypto.randomUUID()
    const values = {
      service_date: date, vehicle_id: v.id, reading: num(reading), service_type: type || null, work_done: work, work_done_other: other.trim() || null,
      parts_used: parts.trim() || null, done_by: doneBy.trim() || null, next_due_date: nextDate || null, next_due_reading: num(nextReading), notes: notes.trim() || null,
    }
    const c = num(cost)
    const priceAdds = isOwner && c !== null && !price ? [{ table: 'record_prices', values: { record_table: 'vehicle_services', record_id: id, total_amount: c } }] : []
    const priceEdits = isOwner && price && c !== Number(price.total_amount) ? [{ table: 'record_prices', id: String(price.id), changes: { total_amount: c } }] : []
    const fileRecords = await attachFiles(ctx.db, 'vehicle_services', id, files)
    await saveAll([...(s ? [] : [{ table: 'vehicle_services', values: { id, ...values } }]), ...priceAdds, ...fileRecords], [...(s ? [{ table: 'vehicle_services', id, changes: values }] : []), ...priceEdits])
    go(back)
  }

  return (
    <Page title={s ? 'Service' : 'Record a service'} kicker={String(v.name)} back={back}>
      <div className="mt-5 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <DateField value={date} onChange={setDate} />
          <Field id="reading" label={v.reading_unit === 'hours' ? 'Hours' : 'km'}><input id="reading" inputMode="decimal" value={reading} onChange={(e) => setReading(e.target.value)} className={inputClass} /></Field>
        </div>
        <Field id="type" label="Service type"><select id="type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}><option value="">Choose</option>{[...new Set([...pick('vehicle_service_type'), type].filter(Boolean))].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <div>
          <div className="mb-2 text-sm font-semibold text-muted">Work done</div>
          <div className="grid grid-cols-2 gap-2">
            {[...new Set([...pick('vehicle_work_done'), ...work])].map((w) => (
              <label key={w} className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-sm">
                <input type="checkbox" checked={work.includes(w)} onChange={() => setWork(work.includes(w) ? work.filter((x) => x !== w) : [...work, w])} className="size-5 accent-green" /> {w}
              </label>
            ))}
          </div>
        </div>
        {work.includes('Other') && <Field id="other" label="Other work"><input id="other" value={other} onChange={(e) => setOther(e.target.value)} className={inputClass} /></Field>}
        <Field id="parts" label="Parts and oils used"><input id="parts" value={parts} onChange={(e) => setParts(e.target.value)} className={inputClass} placeholder="e.g. 15W-40 x 8 L, oil filter" /></Field>
        <Field id="by" label="Done by"><input id="by" value={doneBy} onChange={(e) => setDoneBy(e.target.value)} className={inputClass} placeholder="Self, or the mechanic" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="nextd" label="Next service due"><input id="nextd" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className={inputClass} /></Field>
          <Field id="nextr" label={`or at (${v.reading_unit})`}><input id="nextr" inputMode="decimal" value={nextReading} onChange={(e) => setNextReading(e.target.value)} className={inputClass} /></Field>
        </div>
        {isOwner && <Field id="cost" label="Cost, including GST ($)" hint="Only owners can see prices."><input id="cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} /></Field>}
        <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
        {attachments.length > 0 && <div className="grid grid-cols-3 gap-2">{attachments.map((a) => <Photo key={String(a.id)} a={a} />)}</div>}
        <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
        <Button kind="secondary" onClick={() => input.current?.click()}>Attach an invoice or photo{files.length ? ` (${files.length} to add)` : ''}</Button>
        <Button onClick={save}>Save service</Button>
      </div>
      {s && (
        <div className="mt-8">
          {confirm ? (
            <div className="flex gap-2"><Button kind="danger" className="flex-1" onClick={async () => { await remove('vehicle_services', String(s.id)); go(back) }}>Yes, delete it</Button><Button kind="secondary" onClick={() => setConfirm(false)}>Keep</Button></div>
          ) : <Button kind="danger" className="w-full" onClick={() => setConfirm(true)}>Delete this service</Button>}
        </div>
      )}
    </Page>
  )
}
