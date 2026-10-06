// Chemical inventory: products, batches and the ledger (received, used,
// written off, stocktake). On hand is always worked out from the ledger.
import { useState, type FormEvent } from 'react'
import type { Row } from '../lib/db'
import { fmtQty, type ProductView } from '../lib/chem'
import { todayLocal } from '../lib/stock'
import { useFarm } from '../lib/useFarm'
import { useHealth } from '../lib/useHealth'
import { useStock } from '../lib/useStock'
import { useSync, useTable } from '../lib/useSync'
import { Button, Card, Choice, Empty, Field, Notice, Page, Row as ListRow, Section, go, inputClass, nowIso } from '../ui'
import { DateField, fmtDate } from './stockParts'

export const KINDS = [
  { value: 'animal_treatment', label: 'Animal' },
  { value: 'spray', label: 'Spray' },
  { value: 'fertiliser', label: 'Fertiliser' },
  { value: 'other', label: 'Other' },
] as const
const UNITS = ['mL', 'L', 'g', 'kg', 't', 'dose'] as const
const WRITE_OFF_REASONS = [
  { value: 'expired', label: 'Out of date' },
  { value: 'leaked_spilled', label: 'Leaked or spilled' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'disposed', label: 'Disposed of' },
  { value: 'returned', label: 'Returned' },
  { value: 'other', label: 'Other' },
]
const base = '/records/chemicals'
const num = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() === '' || Number.isNaN(n) ? null : n }
const expiryText = (d: string | null) => (d ? `expires ${new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { month: '2-digit', year: 'numeric' })}` : null)

function useChem() {
  const stock = useStock()
  return useHealth(stock.mobName)
}

// ---- The list ---------------------------------------------------------------

export function ChemicalList() {
  const health = useChem()
  const [kind, setKind] = useState<'all' | string>('all')
  const list = health.chem.filter((p) => kind === 'all' || p.kind === kind)
  const expiring = health.chem.reduce((n, p) => n + p.batches.filter((b) => b.onHand > 0 && b.expiringSoon).length, 0)
  const below = health.chem.filter((p) => p.needsStocktake).length

  return (
    <Page title="Chemicals" kicker="Records" back="/records"
      action={<Button onClick={() => go(`${base}/new`)} className="shrink-0">Add</Button>}>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {[{ value: 'all', label: 'All' }, ...KINDS].map((k) => (
          <button key={k.value} onClick={() => setKind(k.value)}
            className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium ${kind === k.value ? 'bg-green-deep text-paper' : 'border border-line bg-card'}`}>{k.label}</button>
        ))}
      </div>
      {(expiring > 0 || below > 0) && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {expiring > 0 && <div className="rounded-2xl border border-amber/40 bg-amber-soft p-4"><div className="text-xl font-semibold">{expiring} {expiring === 1 ? 'batch' : 'batches'}</div><div className="text-sm">expire within 30 days</div></div>}
          {below > 0 && <div className="rounded-2xl border border-alert/30 bg-alert-soft p-4 text-alert-ink"><div className="text-xl font-semibold">{below} {below === 1 ? 'product' : 'products'}</div><div className="text-sm">below zero, needs a stocktake</div></div>}
        </div>
      )}
      <div className="mt-5">
        {health.ready && list.length === 0 && <Empty>No chemicals yet. Add a product, then record what you've received.</Empty>}
        {list.length > 0 && (
          <Card>
            {list.map((p) => <ProductRow key={p.id} p={p} />)}
          </Card>
        )}
      </div>
    </Page>
  )
}

function ProductRow({ p }: { p: ProductView }) {
  const r = p.row
  const kind = KINDS.find((k) => k.value === p.kind)?.label
  const withhold = p.kind === 'animal_treatment'
    ? [r.label_whp_days != null ? `WHP ${r.label_whp_days}` : null, r.label_esi_days != null ? `ESI ${r.label_esi_days}` : null]
    : [r.label_grazing_whp_days != null ? `grazing WHP ${r.label_grazing_whp_days} days` : null]
  const detail = p.needsStocktake ? <span className="text-alert">{kind} · more used than received, stocktake</span>
    : p.expiringSoon ? <span className="text-amber">{kind} · a batch expires soon</span>
    : [kind, r.chemical_group ? `Group ${r.chemical_group}` : null, ...withhold].filter(Boolean).join(' · ')
  return (
    <ListRow onClick={() => go(`${base}/${p.id}`)} label={p.name} detail={detail}
      value={r.track_stock === false ? <span className="text-xs">not tracked</span> : <span className={`text-base font-semibold ${p.onHand < 0 ? 'text-alert' : 'text-ink'}`}>{fmtQty(p.onHand, p.unit)}</span>} />
  )
}

// ---- One product -----------------------------------------------------------

export function ProductScreen({ id }: { id: string }) {
  const health = useChem()
  if (!health.ready) return null
  const p = health.chem.find((x) => x.id === id)
  if (!p) return <Page title="Not found" back={base}><p className="mt-4 text-muted">That product isn't on this phone.</p></Page>
  const r = p.row
  const kind = KINDS.find((k) => k.value === p.kind)?.label

  return (
    <Page title={p.name} kicker={[kind, r.chemical_group ? `Group ${r.chemical_group}` : null].filter(Boolean).join(' · ')} back={base}
      action={<Button kind="secondary" className="shrink-0 px-4" onClick={() => go(`${base}/${id}/edit`)}>Edit</Button>}>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={`font-display text-4xl ${p.onHand < 0 ? 'text-alert' : 'text-ink'}`}>{fmtQty(p.onHand, p.unit)}</span>
        <span className="text-muted">on hand</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        {[r.active_constituent, p.kind === 'animal_treatment' && r.label_whp_days != null ? `WHP ${r.label_whp_days} days` : null,
          p.kind === 'animal_treatment' && r.label_esi_days != null ? `ESI ${r.label_esi_days} days` : null,
          r.label_grazing_whp_days != null ? `Grazing WHP ${r.label_grazing_whp_days} days` : null].filter(Boolean).join(' · ')}
      </p>
      {p.needsStocktake && <div className="mt-4"><Notice tone="alert">More has been used than received. Do a stocktake to set the right amount.</Notice></div>}
      <div className="mt-5 grid grid-cols-3 gap-2">
        <Button onClick={() => go(`${base}/${id}/receive`)} className="px-2">Received</Button>
        <Button kind="secondary" onClick={() => go(`${base}/${id}/writeoff`)} className="px-2">Write off</Button>
        <Button kind="secondary" onClick={() => go(`${base}/${id}/stocktake`)} className="px-2">Stocktake</Button>
      </div>
      {p.batches.length === 0 && <div className="mt-6"><Empty>Nothing received yet.</Empty></div>}
      {p.batches.map((b) => (
        <Section key={b.id} title={b.batchNumber ? `Batch ${b.batchNumber}` : 'No batch number'}
          aside={<span className={`text-sm font-semibold ${b.onHand < 0 ? 'text-alert' : ''}`}>{fmtQty(b.onHand, p.unit)}</span>}>
          {b.expiry && <p className={`-mt-2 mb-2 text-sm ${b.expired ? 'text-alert' : b.expiringSoon ? 'text-amber' : 'text-muted'}`}>{b.expired ? 'Expired' : 'Expires'} {fmtDate(b.expiry, { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
          <Card>
            {b.entries.length === 0 && <div className="px-4 py-3 text-sm text-muted">No entries.</div>}
            {b.entries.map((e, i) => (
              <button key={e.ledgerId ?? e.itemId ?? i} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm active:bg-paper"
                onClick={() => e.ledgerId ? go(`${base}/${id}/ledger/${e.ledgerId}`) : go(e.path ?? `/records/treatments/${treatmentOf(health.items, e.itemId)}`)}>
                <span className="w-14 shrink-0 text-muted">{fmtDate(e.date)}</span>
                <span className="min-w-0 flex-1">{e.text}</span>
                <span className={`shrink-0 font-semibold ${e.quantity < 0 ? 'text-alert' : 'text-green-deep'}`}>{e.quantity > 0 ? '+' : '−'}{fmtQty(Math.abs(e.quantity), p.unit)}</span>
              </button>
            ))}
          </Card>
        </Section>
      ))}
    </Page>
  )
}

const treatmentOf = (items: Row[], itemId?: string) => String(items.find((i) => i.id === itemId)?.treatment_id ?? '')

// ---- Adding or editing a product ---------------------------------------------

export function ProductFormScreen({ id }: { id?: string }) {
  const products = useTable('products')
  if (!products) return null
  const p = id ? products.find((x) => x.id === id) : undefined
  if (id && !p) return <Page title="Not found" back={base}><p className="mt-4 text-muted">That product isn't on this phone.</p></Page>
  return <ProductForm key={id ?? 'new'} product={p} products={products} />
}

function ProductForm({ product, products }: { product?: Row; products: Row[] }) {
  const { add, edit } = useSync()
  const s = (k: string) => (product?.[k] === null || product?.[k] === undefined ? '' : String(product[k]))
  const [name, setName] = useState(s('name'))
  const [kind, setKind] = useState<string>(s('product_kind') || 'animal_treatment')
  const [unit, setUnit] = useState<string>(s('stock_unit') || 'mL')
  const [group, setGroup] = useState(s('chemical_group'))
  const [active, setActive] = useState(s('active_constituent'))
  const [apvma, setApvma] = useState(s('apvma_number'))
  const [whp, setWhp] = useState(s('label_whp_days'))
  const [esi, setEsi] = useState(s('label_esi_days'))
  const [grazing, setGrazing] = useState(s('label_grazing_whp_days'))
  const [harvest, setHarvest] = useState(s('label_harvest_whp_days'))
  const [dose, setDose] = useState(s('default_dose_rate'))
  const [track, setTrack] = useState(product?.track_stock !== false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = name.trim().replace(/\s+/g, ' ')
    if (!n) return setError('Give the product its trade name, e.g. Cydectin Pour-On.')
    if (products.some((p) => p.id !== product?.id && !p.archived_at && String(p.name).toLowerCase() === n.toLowerCase())) return setError(`${n} is already in the list.`)
    const values = {
      name: n, product_kind: kind, stock_unit: unit, chemical_group: group.trim() || null, active_constituent: active.trim() || null,
      apvma_number: apvma.trim() || null, label_whp_days: num(whp), label_esi_days: num(esi), label_grazing_whp_days: num(grazing),
      label_harvest_whp_days: num(harvest), default_dose_rate: dose.trim() || null, track_stock: track,
    }
    if (product) { await edit('products', String(product.id), values); go(`${base}/${product.id}`) }
    else { const id = await add('products', values); go(`${base}/${id}`) }
  }

  return (
    <Page title={product ? `Edit ${String(product.name)}` : 'New product'} kicker="Chemicals" back={product ? `${base}/${product.id}` : base}>
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <Field id="name" label="Trade name"><input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Cydectin Pour-On" /></Field>
        <Field id="kind" label="Used for"><Choice value={kind} onChange={setKind} options={[...KINDS]} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="unit" label="Counted in">
            <select id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          </Field>
          <Field id="group" label="Chemical group"><input id="group" value={group} onChange={(e) => setGroup(e.target.value)} className={inputClass} placeholder="e.g. ML" /></Field>
        </div>
        <Field id="active" label="Active constituent"><input id="active" value={active} onChange={(e) => setActive(e.target.value)} className={inputClass} /></Field>
        {kind === 'animal_treatment' && (
          <div className="grid grid-cols-2 gap-3">
            <Field id="whp" label="WHP (days)"><input id="whp" inputMode="numeric" value={whp} onChange={(e) => setWhp(e.target.value)} className={inputClass} /></Field>
            <Field id="esi" label="ESI (days)"><input id="esi" inputMode="numeric" value={esi} onChange={(e) => setEsi(e.target.value)} className={inputClass} /></Field>
          </div>
        )}
        {kind !== 'animal_treatment' && (
          <div className="grid grid-cols-2 gap-3">
            <Field id="grazing" label="Grazing WHP (days)"><input id="grazing" inputMode="numeric" value={grazing} onChange={(e) => setGrazing(e.target.value)} className={inputClass} /></Field>
            <Field id="harvest" label="Harvest WHP (days)"><input id="harvest" inputMode="numeric" value={harvest} onChange={(e) => setHarvest(e.target.value)} className={inputClass} /></Field>
          </div>
        )}
        <p className="-mt-2 text-xs text-muted">Enter withholding periods from the product label. The label is the source of truth, so check it's current.</p>
        <Field id="dose" label="Usual dose or rate"><input id="dose" value={dose} onChange={(e) => setDose(e.target.value)} className={inputClass} placeholder="e.g. 1 mL/10 kg" /></Field>
        <Field id="apvma" label="APVMA number"><input id="apvma" value={apvma} onChange={(e) => setApvma(e.target.value)} className={inputClass} /></Field>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} className="size-5 accent-green" /> Keep track of how much is in stock</label>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button type="submit">{product ? 'Save changes' : 'Add product'}</Button>
      </form>
      {product && (
        <div className="mt-10">
          <Button kind="danger" className="w-full" onClick={() => { edit('products', String(product.id), { archived_at: nowIso() }); go(base) }}>Archive product</Button>
          <p className="mt-2 text-center text-xs text-muted">Hides it from lists. Its records are kept.</p>
        </div>
      )}
    </Page>
  )
}

// ---- Received ----------------------------------------------------------------

export function ReceiveScreen({ id }: { id: string }) {
  const health = useChem()
  if (!health.ready) return null
  const p = health.chem.find((x) => x.id === id)
  if (!p) return null
  return <ReceiveForm key={id} p={p} />
}

function ReceiveForm({ p }: { p: ProductView }) {
  const { saveAll } = useSync()
  const { isOwner } = useFarm()
  const [batchId, setBatchId] = useState<string>(p.batches[0]?.id ?? 'new')
  const [batchNo, setBatchNo] = useState('')
  const [expiry, setExpiry] = useState('')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [notes, setNotes] = useState('')
  const [cost, setCost] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const q = num(qty)
    if (!q || q <= 0) return setError(`How much was received, in ${p.unit}?`)
    const adds = []
    let batch = batchId
    if (batchId === 'new') {
      batch = crypto.randomUUID()
      adds.push({ table: 'product_batches', values: { id: batch, product_id: p.id, batch_number: batchNo.trim() || null, expiry_date: expiry || null } })
    }
    const ledgerId = crypto.randomUUID()
    adds.push({ table: 'chemical_ledger', values: { id: ledgerId, batch_id: batch, entry_date: date, entry_type: 'received', quantity: q, notes: notes.trim() || null } })
    const c = num(cost)
    if (isOwner && c !== null) adds.push({ table: 'record_prices', values: { record_table: 'chemical_ledger', record_id: ledgerId, total_amount: c } })
    await saveAll(adds)
    go(`${base}/${p.id}`)
  }

  return (
    <Page title="Received" kicker={p.name} back={`${base}/${p.id}`}>
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <Field id="batch" label="Batch">
          <select id="batch" value={batchId} onChange={(e) => setBatchId(e.target.value)} className={inputClass}>
            {p.batches.map((b) => <option key={b.id} value={b.id}>{b.batchNumber ?? 'No batch number'}{b.expiry ? ` · ${expiryText(b.expiry)}` : ''}</option>)}
            <option value="new">A new batch</option>
          </select>
        </Field>
        {batchId === 'new' && (
          <div className="grid grid-cols-2 gap-3">
            <Field id="batchno" label="Batch number"><input id="batchno" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} className={inputClass} /></Field>
            <Field id="expiry" label="Expiry"><input id="expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputClass} /></Field>
          </div>
        )}
        <Field id="qty" label={`Quantity (${p.unit})`}><input id="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} /></Field>
        <DateField value={date} onChange={setDate} />
        <Field id="notes" label="Notes" hint="e.g. who it came from"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
        {isOwner && <Field id="cost" label="Cost, including GST ($)" hint="Only owners can see prices."><input id="cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} /></Field>}
        {error && <Notice tone="alert">{error}</Notice>}
        <Button type="submit">Add to stock</Button>
      </form>
    </Page>
  )
}

// ---- Write off and stocktake ---------------------------------------------------

export function WriteOffScreen({ id, stocktake }: { id: string; stocktake?: boolean }) {
  const health = useChem()
  if (!health.ready) return null
  const p = health.chem.find((x) => x.id === id)
  if (!p) return null
  if (p.batches.length === 0) return <Page title={stocktake ? 'Stocktake' : 'Write off'} kicker={p.name} back={`${base}/${id}`}><p className="mt-4 text-muted">Record what's been received first.</p></Page>
  return stocktake ? <StocktakeForm key={id} p={p} /> : <WriteOffForm key={id} p={p} />
}

function WriteOffForm({ p }: { p: ProductView }) {
  const { add } = useSync()
  const [batchId, setBatchId] = useState(p.batches.find((b) => b.onHand > 0)?.id ?? p.batches[0].id)
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('expired')
  const [date, setDate] = useState(todayLocal())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const q = num(qty)
    if (!q || q <= 0) return setError(`How much, in ${p.unit}?`)
    await add('chemical_ledger', { batch_id: batchId, entry_date: date, entry_type: 'written_off', write_off_reason: reason, quantity: -q, notes: notes.trim() || null })
    go(`${base}/${p.id}`)
  }

  return (
    <Page title="Write off" kicker={p.name} back={`${base}/${p.id}`}>
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <BatchSelect p={p} value={batchId} onChange={setBatchId} />
        <Field id="qty" label={`Quantity (${p.unit})`}><input id="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} /></Field>
        <Field id="reason" label="Why">
          <select id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>
            {WRITE_OFF_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <DateField value={date} onChange={setDate} />
        <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder="e.g. drum leaked in the shed" /></Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button type="submit">Write off</Button>
      </form>
    </Page>
  )
}

function StocktakeForm({ p }: { p: ProductView }) {
  const { add } = useSync()
  const [batchId, setBatchId] = useState(p.batches[0].id)
  const [counted, setCounted] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [error, setError] = useState<string | null>(null)
  const batch = p.batches.find((b) => b.id === batchId)!
  const c = num(counted)
  const diff = c === null ? null : Math.round((c - batch.onHand) * 1000) / 1000

  async function save(e: FormEvent) {
    e.preventDefault()
    if (c === null || c < 0) return setError(`How much is actually there, in ${p.unit}?`)
    if (diff === 0) { go(`${base}/${p.id}`); return }
    await add('chemical_ledger', { batch_id: batchId, entry_date: date, entry_type: 'stocktake_adjustment', quantity: diff, notes: `Counted ${fmtQty(c, p.unit)}` })
    go(`${base}/${p.id}`)
  }

  return (
    <Page title="Stocktake" kicker={p.name} back={`${base}/${p.id}`}>
      <p className="mt-3 text-muted">Enter what is actually in the shed. The difference is recorded as an adjustment.</p>
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <BatchSelect p={p} value={batchId} onChange={setBatchId} />
        <Field id="counted" label={`Actually there (${p.unit})`} hint={`The records say ${fmtQty(batch.onHand, p.unit)}.`}>
          <input id="counted" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} className={inputClass} />
        </Field>
        {diff !== null && diff !== 0 && <Notice tone="info">Adjustment: {diff > 0 ? '+' : '−'}{fmtQty(Math.abs(diff), p.unit)}</Notice>}
        <DateField value={date} onChange={setDate} />
        {error && <Notice tone="alert">{error}</Notice>}
        <Button type="submit">Save stocktake</Button>
      </form>
    </Page>
  )
}

function BatchSelect({ p, value, onChange }: { p: ProductView; value: string; onChange: (v: string) => void }) {
  return (
    <Field id="batch" label="Batch">
      <select id="batch" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {p.batches.map((b) => <option key={b.id} value={b.id}>{b.batchNumber ?? 'No batch number'} · {fmtQty(b.onHand, p.unit)}{b.expiry ? ` · ${expiryText(b.expiry)}` : ''}</option>)}
      </select>
    </Field>
  )
}

// ---- Correcting a ledger entry ---------------------------------------------------

export function LedgerEntryScreen({ productId, ledgerId }: { productId: string; ledgerId: string }) {
  const ledger = useTable('chemical_ledger')
  const products = useTable('products')
  if (!ledger || !products) return null
  const l = ledger.find((x) => x.id === ledgerId)
  const p = products.find((x) => x.id === productId)
  if (!l || !p) return <Page title="Not found" back={`${base}/${productId}`}><p className="mt-4 text-muted">That entry has been deleted or isn't on this phone.</p></Page>
  return <LedgerForm key={ledgerId} l={l} p={p} />
}

function LedgerForm({ l, p }: { l: Row; p: Row }) {
  const { edit, remove } = useSync()
  const unit = String(p.stock_unit)
  const sign = Number(l.quantity) < 0 ? -1 : 1
  const [qty, setQty] = useState(String(Math.abs(Number(l.quantity))))
  const [date, setDate] = useState(String(l.entry_date))
  const [notes, setNotes] = useState(String(l.notes ?? ''))
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const back = `${base}/${p.id}`
  const label = { received: 'Received', written_off: 'Written off', stocktake_adjustment: 'Stocktake adjustment', used: 'Used' }[String(l.entry_type)]

  async function save(e: FormEvent) {
    e.preventDefault()
    const q = num(qty)
    if (q === null) return
    await edit('chemical_ledger', String(l.id), { quantity: sign * Math.abs(q), entry_date: date, notes: notes.trim() || null }, reason.trim() || undefined)
    go(back)
  }

  return (
    <Page title={label ?? 'Entry'} kicker={String(p.name)} back={back}>
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <Field id="qty" label={`Quantity (${unit})`}><input id="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} /></Field>
        <DateField value={date} onChange={setDate} />
        <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
        <Field id="why" label="Reason for the change (optional)"><input id="why" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} /></Field>
        <Button type="submit">Save changes</Button>
      </form>
      <div className="mt-10">
        {confirm ? (
          <div className="flex gap-2">
            <Button kind="danger" className="flex-1" onClick={async () => { await remove('chemical_ledger', String(l.id), reason.trim() || undefined); go(back) }}>Yes, delete it</Button>
            <Button kind="secondary" onClick={() => setConfirm(false)}>Keep</Button>
          </div>
        ) : <Button kind="danger" className="w-full" onClick={() => setConfirm(true)}>Delete this entry</Button>}
      </div>
    </Page>
  )
}
