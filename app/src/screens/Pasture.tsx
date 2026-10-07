// Pasture and fertiliser records, with agronomist reports and soil tests
// attached. Contractors can record against their job.
import { useRef, useState } from 'react'
import type { Row } from '../lib/db'
import { fmtQty } from '../lib/chem'
import { attachFiles, useAttachments } from '../lib/files'
import { pasturePlan, type PastureItemInput } from '../lib/land'
import { todayLocal } from '../lib/stock'
import { useFarm } from '../lib/useFarm'
import { useHealth } from '../lib/useHealth'
import { useStock } from '../lib/useStock'
import { useSync, useTable } from '../lib/useSync'
import { Button, Card, Choice, Empty, Field, Notice, Page, Section, go, inputClass, query } from '../ui'
import { Photo } from './Issues'
import { PaddockMultiPick, areaOf } from './landParts'
import { ContactPicker } from './StockActions'
import { DateField, fmtDate } from './stockParts'
import type { NewRecord } from '../lib/sync'

const num = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() === '' || Number.isNaN(n) ? null : n }
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

type ItemForm = { key: string; id?: string; kind: 'fertiliser' | 'species'; productId: string; productName: string; batchId: string; species: string; rate: string; used: string }
const emptyItem = (kind: 'fertiliser' | 'species'): ItemForm => ({ key: crypto.randomUUID(), kind, productId: '', productName: '', batchId: '', species: '', rate: '', used: '' })

export function PastureList() {
  const records = useTable('pasture_records')
  const links = useTable('pasture_record_paddocks') ?? []
  const paddocks = useTable('paddocks') ?? []
  const list = [...(records ?? [])].sort((a, b) => String(b.record_date).localeCompare(String(a.record_date)))
  return (
    <Page title="Pasture and fertiliser" kicker="Paddocks" back="/paddocks" action={<Button className="shrink-0" onClick={() => go('/records/pasture/new')}>Record</Button>}>
      <div className="mt-5">
        {records && list.length === 0 && <Empty>No pasture or fertiliser records yet.</Empty>}
        {list.length > 0 && (
          <Card>
            {list.map((r) => {
              const names = r.whole_property ? ['Whole property'] : links.filter((l) => l.pasture_record_id === r.id).map((l) => String(paddocks.find((d) => d.id === l.paddock_id)?.name ?? '')).filter(Boolean)
              return (
                <button key={String(r.id)} onClick={() => go(`/records/pasture/${r.id}`)} className="flex w-full gap-4 px-4 py-3 text-left active:bg-paper">
                  <span className="w-14 shrink-0 text-sm text-muted">{fmtDate(String(r.record_date))}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.record_type === 'fertiliser' ? 'Fertiliser' : 'Pasture improvement'}{r.overall_rate ? ` · ${r.overall_rate}` : ''}</span>
                    <span className="block text-sm text-muted">{names.join(', ')}</span>
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

export function PastureScreen({ id }: { id?: string }) {
  const records = useTable('pasture_records')
  const links = useTable('pasture_record_paddocks')
  const items = useTable('pasture_record_items')
  const jobs = useTable('jobs')
  const jobLinks = useTable('job_paddocks')
  if (!records || !links || !items || !jobs || !jobLinks) return null
  const existing = id ? records.find((r) => r.id === id) : undefined
  if (id && !existing) return <Page title="Not found" back="/records/pasture"><p className="mt-4 text-muted">That record has been deleted or isn't on this phone.</p></Page>
  const jobId = String(existing?.job_id ?? query().get('job') ?? '')
  const job = jobs.find((j) => j.id === jobId)
  return <PastureForm key={id ?? 'new'} existing={existing} links={links} items={items} job={job} jobPaddocks={job ? jobLinks.filter((l) => l.job_id === job.id).map((l) => String(l.paddock_id)) : undefined} />
}

function PastureForm({ existing, links, items: allItems, job, jobPaddocks }: { existing?: Row; links: Row[]; items: Row[]; job?: Row; jobPaddocks?: string[] }) {
  const stock = useStock()
  const health = useHealth(stock.mobName)
  const { me } = useFarm()
  const { saveAll, remove, ctx } = useSync()
  const contractor = me?.role === 'contractor'
  const paddocks = useTable('paddocks') ?? []
  const properties = useTable('properties') ?? []
  const attachments = useAttachments('pasture_records', existing ? String(existing.id) : undefined)
  const myItems = existing ? allItems.filter((i) => i.pasture_record_id === existing.id) : []
  const usedSpecies = [...new Set(allItems.map((i) => String(i.species_name ?? '')).filter(Boolean))]
  const [type, setType] = useState<'fertiliser' | 'pasture_improvement'>((existing?.record_type as 'fertiliser') ?? (job?.job_type === 'sowing' ? 'pasture_improvement' : 'fertiliser'))
  const [date, setDate] = useState(str(existing?.record_date) || todayLocal())
  const [propertyPick, setPropertyId] = useState(str(existing?.property_id ?? job?.property_id))
  const propertyId = propertyPick || String(properties[0]?.id ?? '')
  const [whole, setWhole] = useState(!!existing?.whole_property)
  const [pids, setPids] = useState<string[]>(existing ? links.filter((l) => l.pasture_record_id === existing.id).map((l) => String(l.paddock_id)) : jobPaddocks ?? [])
  const [area, setArea] = useState(str(existing?.area_ha))
  const [rate, setRate] = useState(str(existing?.overall_rate))
  const [contractorContact, setContractorContact] = useState(str(existing?.contractor_contact_id))
  const [newContacts, setNewContacts] = useState<NewRecord[]>([])
  const [notes, setNotes] = useState(str(existing?.notes))
  const [reason, setReason] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<ItemForm[]>(() => myItems.length ? myItems.map((i) => ({
    key: String(i.id), id: String(i.id), kind: i.item_kind as 'fertiliser', productId: str(i.product_id) || (i.product_name ? 'new' : ''), productName: str(i.product_name),
    batchId: str(i.batch_id), species: str(i.species_name), rate: str(i.rate), used: str(i.quantity_used),
  })) : [emptyItem('fertiliser')])
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const products = health.products.filter((p) => ['fertiliser', 'other'].includes(String(p.product_kind)) && !p.archived_at).sort((a, b) => String(a.name).localeCompare(String(b.name)))
  const update = (key: string, c: Partial<ItemForm>) => setItems((l) => l.map((i) => (i.key === key ? { ...i, ...c } : i)))
  const back = contractor && job ? `/jobs/${job.id}` : '/records/pasture'
  const mapped = whole ? areaOf(paddocks, paddocks.filter((d) => d.property_id === propertyId).map((d) => String(d.id))) : areaOf(paddocks, pids)

  async function save() {
    if (!whole && pids.length === 0) return setError('Tick the paddocks, or choose Whole property.')
    const inputs: PastureItemInput[] = items.filter((i) => i.productId || i.species.trim()).map((i) => ({
      id: i.id, kind: i.kind, productId: i.productId && i.productId !== 'new' ? i.productId : null, productName: i.productId === 'new' ? i.productName : null,
      batchId: i.productId && i.productId !== 'new' && i.batchId ? i.batchId : null, speciesName: i.species, rate: i.rate, quantityUsed: num(i.used),
    }))
    const plan = pasturePlan({
      id: existing ? String(existing.id) : undefined, date, type, propertyId, wholeProperty: whole, paddockIds: pids, areaHa: num(area) ?? (mapped || null),
      overallRate: rate, contractorContactId: contractorContact || null, jobId: job ? String(job.id) : null,
      contractorEntered: existing ? !!existing.contractor_entered : contractor, notes, items: inputs,
    }, { paddocks: links, items: allItems }, reason.trim() || undefined)
    const fileRecords = contractor ? [] : await attachFiles(ctx.db, 'pasture_records', plan.id, files)
    await saveAll([...newContacts, ...plan.adds, ...fileRecords], plan.edits)
    go(back)
  }

  return (
    <Page title={existing ? (type === 'fertiliser' ? 'Fertiliser record' : 'Pasture improvement') : 'Record pasture or fertiliser'} kicker={job ? 'Contractor job' : 'Pasture and fertiliser'} back={back}>
      <div className="mt-5 flex flex-col gap-4">
        <Field id="type" label="Type"><Choice value={type} onChange={(v) => { setType(v); if (items.every((i) => !i.productId && !i.species)) setItems([emptyItem(v === 'fertiliser' ? 'fertiliser' : 'species')]) }} options={[{ value: 'fertiliser', label: 'Fertiliser' }, { value: 'pasture_improvement', label: 'Pasture improvement' }]} /></Field>
        <DateField value={date} onChange={setDate} />
        {!job && properties.length > 1 && (
          <Field id="prop" label="Property">
            <select id="prop" value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setPids([]) }} className={inputClass}>{properties.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}</select>
          </Field>
        )}
        {!job && <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} className="size-5 accent-green" /> Whole property</label>}
        {!whole && <PaddockMultiPick paddocks={paddocks} propertyId={propertyId} value={pids} onChange={setPids} limitTo={jobPaddocks} />}
        <div className="grid grid-cols-2 gap-3">
          <Field id="area" label="Area (ha)" hint={mapped && !area ? `Paddocks: ${mapped} ha` : undefined}><input id="area" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} className={inputClass} placeholder={mapped ? String(mapped) : ''} /></Field>
          <Field id="rate" label="Overall rate"><input id="rate" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} placeholder="e.g. 125 kg/ha" /></Field>
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-xl text-green-deep">{type === 'fertiliser' ? 'Products' : 'Products and species'}</h2>
      <div className="flex flex-col gap-3">
        {items.map((i) => {
          const view = health.chem.find((p) => p.id === i.productId)
          return (
            <div key={i.key} className="rounded-2xl border border-line bg-card p-4">
              {type === 'pasture_improvement' && <div className="mb-3"><Choice value={i.kind} onChange={(v) => update(i.key, { kind: v })} options={[{ value: 'species', label: 'Species (seed)' }, { value: 'fertiliser', label: 'Fertiliser' }]} /></div>}
              {i.kind === 'species' ? (
                <Field id={`s-${i.key}`} label="Species">
                  <input id={`s-${i.key}`} list="species-used" value={i.species} onChange={(e) => update(i.key, { species: e.target.value })} className={inputClass} placeholder="e.g. Phalaris" />
                </Field>
              ) : (
                <>
                  <Field id={`p-${i.key}`} label="Product">
                    <select id={`p-${i.key}`} value={i.productId} onChange={(e) => { const v = health.chem.find((x) => x.id === e.target.value); update(i.key, { productId: e.target.value, batchId: v?.batches.find((b) => b.onHand > 0)?.id ?? '' }) }} className={inputClass}>
                      <option value="">Choose a product</option>
                      {products.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}
                      <option value="new">Not in the list (type it in)</option>
                    </select>
                  </Field>
                  {i.productId === 'new' && <div className="mt-3"><Field id={`n-${i.key}`} label="Product name"><input id={`n-${i.key}`} value={i.productName} onChange={(e) => update(i.key, { productName: e.target.value })} className={inputClass} placeholder="e.g. Single super" /></Field></div>}
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
                </>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Field id={`r-${i.key}`} label="Rate"><input id={`r-${i.key}`} value={i.rate} onChange={(e) => update(i.key, { rate: e.target.value })} className={inputClass} placeholder={i.kind === 'species' ? 'e.g. 4 kg/ha' : 'e.g. 125 kg/ha'} /></Field>
                {i.kind === 'fertiliser' && <Field id={`u-${i.key}`} label={`Used${view ? ` (${view.unit})` : ''}`}><input id={`u-${i.key}`} inputMode="decimal" value={i.used} onChange={(e) => update(i.key, { used: e.target.value })} className={inputClass} /></Field>}
              </div>
              {items.length > 1 && <button onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))} className="mt-3 text-sm font-medium text-alert underline">Remove</button>}
            </div>
          )
        })}
        <datalist id="species-used">{usedSpecies.map((s) => <option key={s} value={s} />)}</datalist>
      </div>
      <Button kind="secondary" className="mt-3 w-full" onClick={() => setItems((l) => [...l, emptyItem(type === 'fertiliser' ? 'fertiliser' : 'species')])}>+ Another {type === 'fertiliser' ? 'product' : 'product or species'}</Button>

      <Section title="Details">
        <div className="flex flex-col gap-4">
          {!contractor && <ContactPicker id="contractor" label="Contractor" kind="contractor" value={contractorContact} onChange={setContractorContact} newContacts={newContacts} setNewContacts={setNewContacts} />}
          <Field id="notes" label="Notes"><textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} h-auto py-3`} /></Field>
          {!contractor && (
            <div>
              <div className="mb-2 text-sm font-semibold text-muted">Agronomist reports, soil tests</div>
              {attachments.length > 0 && <div className="mb-2 grid grid-cols-3 gap-2">{attachments.map((a) => <Photo key={String(a.id)} a={a} />)}</div>}
              <input ref={fileInput} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
              <Button kind="secondary" className="w-full" onClick={() => fileInput.current?.click()}>Attach a report or photo{files.length ? ` (${files.length} to add)` : ''}</Button>
            </div>
          )}
          {existing && <Field id="why" label="Reason for the change (optional)"><input id="why" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} /></Field>}
          {error && <Notice tone="alert">{error}</Notice>}
          <Button onClick={save}>{existing ? 'Save changes' : 'Save record'}</Button>
        </div>
      </Section>
      {existing && (
        <div className="mt-8">
          {confirm ? (
            <div className="flex gap-2">
              <Button kind="danger" className="flex-1" onClick={async () => { await remove('pasture_records', String(existing.id), reason.trim() || undefined); go(back) }}>Yes, delete it</Button>
              <Button kind="secondary" onClick={() => setConfirm(false)}>Keep</Button>
            </div>
          ) : <Button kind="danger" className="w-full" onClick={() => setConfirm(true)}>Delete this record</Button>}
        </div>
      )}
    </Page>
  )
}
