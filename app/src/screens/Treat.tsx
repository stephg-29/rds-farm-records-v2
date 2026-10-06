// Recording a treatment (the LPA livestock treatment record), and the list
// of treatments. Several products can be given in one treatment.
import { useState } from 'react'
import type { Row } from '../lib/db'
import { fmtQty } from '../lib/chem'
import { todayLocal } from '../lib/stock'
import { quickProduct, rotationHint, treatmentPlan, type TreatmentItemInput } from '../lib/treat'
import { useFarm } from '../lib/useFarm'
import { useHealth } from '../lib/useHealth'
import { useStock, type MobView, type Stock } from '../lib/useStock'
import { useSync, useTable } from '../lib/useSync'
import { addDays } from '../lib/withholds'
import { Button, Card, Empty, Field, Notice, Page, go, inputClass } from '../ui'
import { DateField, fmtDate } from './stockParts'

const num = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() === '' || Number.isNaN(n) ? null : n }
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

type ItemForm = {
  key: string
  id?: string
  productId: string
  // A product name typed in that isn't in the list yet.
  newName: string
  batchId: string
  doseRate: string
  weight: string
  route: string
  used: string
  reason: string
  whp: string
  esi: string
  adverse: string
  brokenNeedle: boolean
}

const emptyItem = (): ItemForm => ({ key: crypto.randomUUID(), productId: '', newName: '', batchId: '', doseRate: '', weight: '', route: '', used: '', reason: '', whp: '', esi: '', adverse: '', brokenNeedle: false })

// ---- New treatment (from a mob) and editing one -------------------------------

export function TreatScreen({ mobId, treatmentId }: { mobId?: string; treatmentId?: string }) {
  const stock = useStock()
  const health = useHealth(stock.mobName)
  if (!stock.ready || !health.ready) return null
  const existing = treatmentId ? health.treatments.find((t) => t.id === treatmentId) : undefined
  if (treatmentId && !existing) return <Page title="Not found" back="/records/treatments"><p className="mt-4 text-muted">That treatment has been deleted or isn't on this phone.</p></Page>
  const m = stock.mob(String(existing?.mob_id ?? mobId ?? ''))
  return <TreatForm key={treatmentId ?? mobId ?? 'new'} stock={stock} existing={existing} existingItems={existing ? health.items.filter((i) => i.treatment_id === existing.id) : []} mob={m} />
}

function TreatForm({ stock, existing, existingItems, mob: initialMob }: { stock: Stock; existing?: Row; existingItems: Row[]; mob?: MobView }) {
  const { saveAll, remove } = useSync()
  const { me } = useFarm()
  const health = useHealth(stock.mobName)
  const lists = useTable('pick_lists')
  const [mobId, setMobId] = useState(initialMob?.id ?? '')
  const mob = stock.mob(mobId)
  const [date, setDate] = useState(str(existing?.treatment_date) || todayLocal())
  const [head, setHead] = useState(existing ? str(existing.head_treated) : str(initialMob?.head))
  const [items, setItems] = useState<ItemForm[]>(() => existingItems.length > 0 ? existingItems.map((i) => ({
    key: String(i.id), id: String(i.id), productId: String(i.product_id), newName: '', batchId: str(i.batch_id), doseRate: str(i.dose_rate),
    weight: str(i.approx_live_weight_kg), route: str(i.route), used: str(i.quantity_used), reason: str(i.reason), whp: str(i.whp_days), esi: str(i.esi_days),
    adverse: str(i.adverse_reactions), brokenNeedle: i.broken_needle === true,
  })) : [emptyItem()])
  const [treatedBy, setTreatedBy] = useState(str(existing?.treated_by_name) || str(me?.full_name))
  const [phone, setPhone] = useState(str(existing?.treated_by_phone) || str(me?.phone))
  const [cleaned, setCleaned] = useState(existing ? existing.equipment_cleaned_calibrated === true : false)
  const [cleanedBy, setCleanedBy] = useState(str(existing?.equipment_cleaned_by))
  const [notes, setNotes] = useState(str(existing?.notes))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const animalProducts = health.products.filter((p) => p.product_kind === 'animal_treatment' && !p.archived_at)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  const pick = (name: string) => (lists ?? []).filter((l) => l.list_name === name && !l.archived_at)
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((l) => String(l.value))
  const routes = pick('treatment_route')
  const reasons = pick('treatment_reason')
  const update = (key: string, changes: Partial<ItemForm>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...changes } : i)))

  // Drench rotation: earlier treatments of this mob, newest first.
  const history = mob ? health.mobTreatments(mob.id).filter((t) => t.treatment.id !== existing?.id)
    .flatMap((t) => t.items.map((i) => ({ productId: String(i.product_id), date: fmtDate(String(t.treatment.treatment_date)), name: health.productName(String(i.product_id)) }))) : []
  const groupOf = (pid: string) => { const g = health.products.find((p) => p.id === pid)?.chemical_group; return g ? String(g) : null }

  function chooseProduct(key: string, productId: string) {
    const p = health.products.find((x) => x.id === productId)
    const view = health.chem.find((x) => x.id === productId)
    const batch = view?.batches.find((b) => b.onHand > 0 && !b.expired) ?? view?.batches[0]
    update(key, {
      productId, newName: '',
      batchId: p?.track_stock === false ? '' : batch?.id ?? '',
      whp: str(p?.label_whp_days), esi: str(p?.label_esi_days),
      doseRate: str(p?.default_dose_rate), route: str(p?.default_route),
    })
  }

  async function save() {
    if (!mob) return setError('Choose the mob that was treated.')
    const h = num(head)
    if (!h || h <= 0) return setError('How many head were treated?')
    const adds: { table: string; values: Row }[] = []
    const inputs: TreatmentItemInput[] = []
    for (const i of items) {
      let productId = i.productId
      if (productId === 'new') {
        if (!i.newName.trim()) return setError('Type the name of the product given.')
        const qp = quickProduct(i.newName, num(i.whp), num(i.esi))
        adds.push(qp)
        productId = qp.id
      }
      if (!productId) return setError('Choose the product given (or remove the empty one).')
      inputs.push({
        id: i.id, productId, batchId: i.batchId || null, doseRate: i.doseRate, weightKg: num(i.weight), route: i.route,
        quantityUsed: num(i.used), reason: i.reason, whpDays: num(i.whp), esiDays: num(i.esi), adverseReactions: i.adverse, brokenNeedle: i.brokenNeedle,
      })
    }
    if (inputs.length === 0) return setError('Add the product given.')
    const plan = treatmentPlan({
      id: existing ? String(existing.id) : undefined, date, mobId: mob.id,
      propertyId: mob.location?.propertyId ?? null, paddockId: mob.location?.paddockId ?? null,
      headTreated: h, description: [mob.name, mob.classes.map((c) => c.name).join(', ')].filter(Boolean).join(' · '),
      treatedByUserId: existing ? (existing.treated_by_user_id as string | null) : (me ? String(me.user_id) : null),
      treatedByName: treatedBy, treatedByPhone: phone, equipmentCleaned: cleaned, equipmentCleanedBy: cleanedBy, notes, items: inputs,
    }, existingItems, reason.trim() || undefined)
    await saveAll([...adds, ...plan.adds], plan.edits)
    go(`/stock/${mob.id}`)
  }

  return (
    <Page title={existing ? 'Treatment' : 'Record treatment'} kicker={mob?.name} back={mob ? `/stock/${mob.id}` : '/records/treatments'}>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <DateField value={date} onChange={setDate} />
        <Field id="head" label="Head treated"><input id="head" inputMode="numeric" value={head} onChange={(e) => setHead(e.target.value.replace(/\D/g, ''))} className={inputClass} /></Field>
      </div>
      {!initialMob && (
        <div className="mt-4">
          <Field id="mob" label="Mob">
            <select id="mob" value={mobId} onChange={(e) => { setMobId(e.target.value); setHead(str(stock.mob(e.target.value)?.head)) }} className={inputClass}>
              <option value="">Choose a mob</option>
              {stock.mobs.filter((m) => m.head > 0).map((m) => <option key={m.id} value={m.id}>{m.name} · {m.head} hd</option>)}
            </select>
          </Field>
        </div>
      )}

      <h2 className="mt-8 mb-3 text-xl text-green-deep">Products given</h2>
      <div className="flex flex-col gap-3">
        {items.map((i) => {
          const view = health.chem.find((x) => x.id === i.productId)
          const product = health.products.find((x) => x.id === i.productId)
          const whpDays = num(i.whp)
          const esiDays = num(i.esi)
          const hint = i.productId && i.productId !== 'new' ? rotationHint(groupOf, history, i.productId) : null
          return (
            <div key={i.key} className="rounded-2xl border border-line bg-card p-4">
              <Field id={`p-${i.key}`} label="Product">
                <select id={`p-${i.key}`} value={i.productId} onChange={(e) => (e.target.value === 'new' ? update(i.key, { productId: 'new', batchId: '' }) : chooseProduct(i.key, e.target.value))} className={inputClass}>
                  <option value="">Choose a product</option>
                  {animalProducts.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}
                  <option value="new">Not in the list (type it in)</option>
                </select>
              </Field>
              {i.productId === 'new' && (
                <div className="mt-3"><Field id={`n-${i.key}`} label="Product name"><input id={`n-${i.key}`} value={i.newName} onChange={(e) => update(i.key, { newName: e.target.value })} className={inputClass} placeholder="e.g. Ivomec Pour-On" /></Field></div>
              )}
              {hint && <div className="mt-3"><Notice tone="info">{hint}</Notice></div>}
              {view && product?.track_stock !== false && (
                <div className="mt-3">
                  <Field id={`b-${i.key}`} label="From">
                    <select id={`b-${i.key}`} value={i.batchId} onChange={(e) => update(i.key, { batchId: e.target.value })} className={inputClass}>
                      {view.batches.map((b) => <option key={b.id} value={b.id}>Batch {b.batchNumber ?? '(no number)'} · {fmtQty(b.onHand, view.unit)}{b.expired ? ' · EXPIRED' : ''}</option>)}
                      <option value="">Not from the shed (e.g. brought from town)</option>
                    </select>
                  </Field>
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Field id={`d-${i.key}`} label="Dose"><input id={`d-${i.key}`} value={i.doseRate} onChange={(e) => update(i.key, { doseRate: e.target.value })} className={inputClass} /></Field>
                <Field id={`w-${i.key}`} label="Weight (kg)"><input id={`w-${i.key}`} inputMode="decimal" value={i.weight} onChange={(e) => update(i.key, { weight: e.target.value })} className={inputClass} /></Field>
                <Field id={`u-${i.key}`} label={`Used${view ? ` (${view.unit})` : ''}`}><input id={`u-${i.key}`} inputMode="decimal" value={i.used} onChange={(e) => update(i.key, { used: e.target.value })} className={inputClass} /></Field>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Field id={`r-${i.key}`} label="Route">
                  <select id={`r-${i.key}`} value={i.route} onChange={(e) => update(i.key, { route: e.target.value })} className={inputClass}>
                    <option value="">Choose</option>
                    {[...new Set([...routes, i.route].filter(Boolean))].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </Field>
                <Field id={`re-${i.key}`} label="Reason">
                  <select id={`re-${i.key}`} value={i.reason} onChange={(e) => update(i.key, { reason: e.target.value })} className={inputClass}>
                    <option value="">Choose</option>
                    {[...new Set([...reasons, i.reason].filter(Boolean))].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <WithholdBox label="WHP" value={i.whp} onChange={(v) => update(i.key, { whp: v })} until={whpDays !== null ? addDays(date, whpDays) : null} id={`whp-${i.key}`} />
                <WithholdBox label="ESI" value={i.esi} onChange={(v) => update(i.key, { esi: v })} until={esiDays !== null ? addDays(date, esiDays) : null} id={`esi-${i.key}`} />
              </div>
              <p className="mt-2 text-xs text-muted">WHP and ESI as entered from the product label. Check the label is current.</p>
              <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
                <Field id={`a-${i.key}`} label="Adverse reactions"><input id={`a-${i.key}`} value={i.adverse} onChange={(e) => update(i.key, { adverse: e.target.value })} className={inputClass} placeholder="None" /></Field>
                <label className="flex h-12 items-center gap-2 text-sm"><input type="checkbox" checked={i.brokenNeedle} onChange={(e) => update(i.key, { brokenNeedle: e.target.checked })} className="size-5 accent-green" /> Broken needle</label>
              </div>
              {items.length > 1 && <button onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))} className="mt-3 text-sm font-medium text-alert underline">Remove this product</button>}
            </div>
          )
        })}
      </div>
      <Button kind="secondary" className="mt-3 w-full" onClick={() => setItems((l) => [...l, emptyItem()])}>+ Another product</Button>

      <h2 className="mt-8 mb-3 text-xl text-green-deep">LPA details</h2>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field id="by" label="Treated by"><input id="by" value={treatedBy} onChange={(e) => setTreatedBy(e.target.value)} className={inputClass} /></Field>
          <Field id="phone" label="Phone"><input id="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} /></Field>
        </div>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={cleaned} onChange={(e) => setCleaned(e.target.checked)} className="size-5 accent-green" /> Equipment cleaned and calibrated</label>
        {cleaned && <Field id="cleanedby" label="Cleaned by"><input id="cleanedby" value={cleanedBy} onChange={(e) => setCleanedBy(e.target.value)} className={inputClass} /></Field>}
        <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
        {existing && <Field id="why" label="Reason for the change (optional)"><input id="why" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} /></Field>}
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save}>{existing ? 'Save changes' : 'Save treatment'}</Button>
      </div>
      {existing && (
        <div className="mt-10">
          {confirmDelete ? (
            <div className="rounded-2xl border border-alert/30 bg-alert-soft p-4">
              <p className="text-sm text-alert-ink">Delete this treatment? Its withholds stop counting and any chemical used goes back into stock. It stays in the change history.</p>
              <div className="mt-3 flex gap-2">
                <Button kind="danger" className="flex-1" onClick={async () => { await remove('treatments', String(existing.id), reason.trim() || undefined); go(mob ? `/stock/${mob.id}` : '/records/treatments') }}>Delete</Button>
                <Button kind="secondary" onClick={() => setConfirmDelete(false)}>Keep</Button>
              </div>
            </div>
          ) : <Button kind="danger" className="w-full" onClick={() => setConfirmDelete(true)}>Delete this treatment</Button>}
        </div>
      )}
    </Page>
  )
}

function WithholdBox({ id, label, value, onChange, until }: { id: string; label: string; value: string; onChange: (v: string) => void; until: string | null }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${until ? 'bg-alert-soft text-alert-ink' : 'bg-paper'}`}>
      <label htmlFor={id} className="text-xs font-semibold">{label} days</label>
      <input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} placeholder="0"
        className="block w-full bg-transparent text-lg font-semibold outline-none" />
      <div className="text-xs">{until ? `Until ${fmtDate(until, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'None'}</div>
    </div>
  )
}

// ---- The list of treatments ------------------------------------------------------

export function TreatmentList() {
  const stock = useStock()
  const health = useHealth(stock.mobName)
  const list = [...health.treatments].sort((a, b) => String(b.treatment_date).localeCompare(String(a.treatment_date)))
  return (
    <Page title="Treatments" kicker="Records" back="/records" action={<Button className="shrink-0" onClick={() => go('/records/treatments/new')}>Record</Button>}>
      <p className="mt-3 text-muted">Every treatment, newest first. Tap one to see or correct it.</p>
      <div className="mt-5">
        {health.ready && list.length === 0 && <Empty>No treatments yet. Record one from a mob's page or with Record.</Empty>}
        {list.length > 0 && (
          <Card>
            {list.map((t) => {
              const its = health.items.filter((i) => i.treatment_id === t.id)
              const until = its.map((i) => i.whp_until).filter(Boolean).map(String).sort().at(-1)
              return (
                <button key={String(t.id)} onClick={() => go(`/records/treatments/${t.id}`)} className="flex w-full gap-4 px-4 py-3 text-left active:bg-paper">
                  <span className="w-14 shrink-0 text-sm text-muted">{fmtDate(String(t.treatment_date))}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{t.mob_id ? stock.mobName(String(t.mob_id)) : String(t.livestock_description ?? 'Stock')} · {String(t.head_treated ?? '')} hd</span>
                    <span className="block text-sm text-muted">{its.map((i) => health.productName(String(i.product_id))).join(', ')}{until ? ` · WHP until ${fmtDate(until)}` : ''}</span>
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
