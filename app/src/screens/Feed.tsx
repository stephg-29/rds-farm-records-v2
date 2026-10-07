// Feed: level 1, what's in the hay sheds and silos (received, fed out,
// written off, stocktake); level 2, rations per mob and feeding them, with
// days of feed left at current rations.
import { useMemo, useState, type FormEvent } from 'react'
import type { Row } from '../lib/db'
import { amountEachFeed, basisOf, currentRation, everyOf, feedStock, feedingPlan, fmtFeed, isBales, kgPerUnit, moveFeedPlan, suggestFeeding, type Basis, type FeedData, type FeedItemView, type FeedLine } from '../lib/feed'
import { mobHeads, todayLocal } from '../lib/stock'
import type { NewRecord } from '../lib/sync'
import { useFarm } from '../lib/useFarm'
import { useStock } from '../lib/useStock'
import { useSync, useTable } from '../lib/useSync'
import { Button, Card, Choice, Empty, Field, Notice, Page, Row as ListRow, Section, go, inputClass, nowIso, query } from '../ui'
import { ContactPicker } from './StockActions'
import { DateField, fmtDate } from './stockParts'

const base = '/records/feed'
const num = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() === '' || Number.isNaN(n) ? null : n }
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const FEED_TYPES = [
  { value: 'hay', label: 'Hay' }, { value: 'silage', label: 'Silage' }, { value: 'grain', label: 'Grain' },
  { value: 'pellets', label: 'Pellets' }, { value: 'supplement_lick', label: 'Lick or supplement' }, { value: 'other', label: 'Other' },
]
const UNITS = [{ value: 'round_bale', label: 'Round bales' }, { value: 'square_bale', label: 'Square bales' }, { value: 't', label: 'Tonnes' }, { value: 'kg', label: 'kg' }]
const SITE_TYPES = [{ value: 'hay_shed', label: 'Hay shed' }, { value: 'silo', label: 'Silo' }, { value: 'bunker_pit', label: 'Bunker or pit' }, { value: 'other', label: 'Other' }]

export function useFeed() {
  const stock = useStock()
  const items = useTable('feed_items')
  const lots = useTable('feed_lots')
  const ledger = useTable('feed_ledger')
  const sites = useTable('feed_storage_sites')
  const rations = useTable('rations')
  const rationItems = useTable('ration_items')
  const assignments = useTable('ration_assignments')
  const feedings = useTable('feeding_events', { includeDeleted: true })
  return useMemo(() => {
    const data: FeedData = {
      items: items ?? [], lots: lots ?? [], ledger: ledger ?? [], sites: (sites ?? []).filter((s) => !s.archived_at), rations: (rations ?? []).filter((r) => !r.archived_at),
      rationItems: rationItems ?? [], assignments: assignments ?? [], feedings: feedings ?? [],
    }
    const today = todayLocal()
    return {
      ready: [items, lots, ledger, sites, rations, rationItems, assignments, feedings].every((x) => x !== undefined) && stock.ready,
      data, stock,
      view: feedStock(data, mobHeads(stock.data), today),
      siteName: (id: string | null) => (id ? String(data.sites.find((s) => s.id === id)?.name ?? 'Storage') : 'No site'),
      itemName: (id: string) => String(data.items.find((i) => i.id === id)?.name ?? 'Feed'),
      rationOf: (mobId: string) => currentRation(data, mobId, today),
    }
  }, [items, lots, ledger, sites, rations, rationItems, assignments, feedings, stock])
}

// ---- Feed home ----------------------------------------------------------------------

export function FeedHome() {
  const f = useFeed()
  const feedings = f.data.feedings!.filter((x) => !x.deleted_at).sort((a, b) => String(b.feed_date).localeCompare(String(a.feed_date))).slice(0, 10)
  return (
    <Page title="Feed" kicker="Stock" back="/stock">
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button onClick={() => go(`${base}/feed`)}>Feed a mob</Button>
        <Button kind="secondary" onClick={() => go(`${base}/receive`)}>Feed received</Button>
      </div>
      <Section title="On hand" aside={<button className="text-sm font-semibold text-green underline" onClick={() => go(`${base}/items/new`)}>Add a feed</button>}>
        {f.ready && f.view.length === 0 && <Empty>No feeds yet. Add one (e.g. Pasture hay, round bales of 400 kg), then record what's received.</Empty>}
        {f.view.length > 0 && (
          <Card>
            {f.view.map((i) => (
              <ListRow key={i.id} onClick={() => go(`${base}/items/${i.id}`)} label={i.name}
                detail={i.daysLeft !== null ? `${i.daysLeft} days left at current rations` : i.kgPerDay > 0 ? 'Set kg per bale to work out days left' : 'Not in a current ration'}
                value={<span className={`font-semibold ${i.onHand < 0 ? 'text-alert' : 'text-ink'}`}>{fmtFeed(i.onHand, i.unit)}</span>} />
            ))}
          </Card>
        )}
      </Section>
      <Section title="Rations" aside={<button className="text-sm font-semibold text-green underline" onClick={() => go(`${base}/rations/new`)}>New ration</button>}>
        {f.data.rations.length === 0 ? <Empty>No rations yet. A ration is a recipe, e.g. 6 kg hay + 0.1 kg lick per head per day, given to one or more mobs.</Empty> : (
          <Card>
            {f.data.rations.map((r) => {
              const mobs = f.data.assignments.filter((a) => a.ration_id === r.id && (!a.end_date || String(a.end_date) >= todayLocal())).map((a) => f.stock.mobName(String(a.mob_id)))
              return <ListRow key={String(r.id)} onClick={() => go(`${base}/rations/${r.id}`)} label={String(r.name)} detail={mobs.length ? `Fed to ${mobs.join(', ')}` : 'No mobs on it'} />
            })}
          </Card>
        )}
      </Section>
      <Section title="Storage" aside={<button className="text-sm font-semibold text-green underline" onClick={() => go(`${base}/sites/new`)}>Add</button>}>
        {f.data.sites.length === 0 ? <Empty>Add your hay sheds and silos to see what's in each.</Empty> : (
          <Card>
            {f.data.sites.map((s) => {
              const here = f.view.flatMap((i) => i.lots.map((l) => ({ i, q: l.bySite.get(String(s.id)) ?? 0 }))).filter((x) => x.q !== 0)
              const totals = new Map<string, { i: FeedItemView; q: number }>()
              for (const x of here) totals.set(x.i.id, { i: x.i, q: (totals.get(x.i.id)?.q ?? 0) + x.q })
              return <ListRow key={String(s.id)} onClick={() => go(`${base}/sites/${s.id}`)} label={String(s.name)} detail={[...totals.values()].map((t) => `${t.i.name} ${fmtFeed(t.q, t.i.unit)}`).join(' · ') || 'Empty'} />
            })}
          </Card>
        )}
      </Section>
      {feedings.length > 0 && (
        <Section title="Recent feeding">
          <Card>
            {feedings.map((fe) => (
              <ListRow key={String(fe.id)} onClick={() => go(`${base}/feedings/${fe.id}`)} label={`${f.stock.mobName(String(fe.mob_id))}${fe.head_fed ? ` · ${fe.head_fed} hd` : ''}`}
                detail={`${fmtDate(String(fe.feed_date))}${fe.ration_id ? ` · ${String(f.data.rations.find((r) => r.id === fe.ration_id)?.name ?? '')}` : ''}`} />
            ))}
          </Card>
        </Section>
      )}
    </Page>
  )
}

// ---- A feed item ---------------------------------------------------------------------

export function FeedItemFormScreen({ id }: { id?: string }) {
  const items = useTable('feed_items')
  if (!items) return null
  const item = id ? items.find((i) => i.id === id) : undefined
  return <FeedItemForm key={id ?? 'new'} item={item} />
}

function FeedItemForm({ item }: { item?: Row }) {
  const { add, edit } = useSync()
  const [name, setName] = useState(str(item?.name))
  const [type, setType] = useState(str(item?.feed_type) || 'hay')
  const [unit, setUnit] = useState(str(item?.unit) || 'round_bale')
  const [kg, setKg] = useState(str(item?.kg_per_unit))
  const [whp, setWhp] = useState(str(item?.whp_days))
  const [esi, setEsi] = useState(str(item?.esi_days))
  const [error, setError] = useState<string | null>(null)
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Name the feed, e.g. Pasture hay.')
    const values = { name: name.trim(), feed_type: type, unit, kg_per_unit: unit === 't' || unit === 'kg' ? null : num(kg), whp_days: num(whp), esi_days: num(esi) }
    if (item) { await edit('feed_items', String(item.id), values); go(`${base}/items/${item.id}`) }
    else { const id = await add('feed_items', values); go(`${base}/items/${id}`) }
  }
  return (
    <Page title={item ? `Edit ${str(item.name)}` : 'New feed'} kicker="Feed" back={item ? `${base}/items/${item.id}` : base}>
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <Field id="name" label="Name"><input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Pasture hay" /></Field>
        <Field id="type" label="Type"><select id="type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>{FEED_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="unit" label="Counted in"><select id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass}>{UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select></Field>
          {(unit === 'round_bale' || unit === 'square_bale') && <Field id="kg" label="kg per bale" hint="Needed for days of feed left."><input id="kg" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} className={inputClass} /></Field>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="whp" label="WHP (days)" hint="Medicated feed or lick only."><input id="whp" inputMode="numeric" value={whp} onChange={(e) => setWhp(e.target.value)} className={inputClass} /></Field>
          <Field id="esi" label="ESI (days)"><input id="esi" inputMode="numeric" value={esi} onChange={(e) => setEsi(e.target.value)} className={inputClass} /></Field>
        </div>
        {(num(whp) || num(esi)) ? <Notice tone="info">Feeding this puts the mob under withhold, like a treatment.</Notice> : null}
        {error && <Notice tone="alert">{error}</Notice>}
        <Button type="submit">{item ? 'Save' : 'Add feed'}</Button>
      </form>
      {item && <Button kind="danger" className="mt-10 w-full" onClick={() => { edit('feed_items', String(item.id), { archived_at: nowIso() }); go(base) }}>Archive this feed</Button>}
    </Page>
  )
}

export function FeedItemScreen({ id }: { id: string }) {
  const f = useFeed()
  const { add } = useSync()
  const { saveAll } = useSync()
  const [adjust, setAdjust] = useState<{ lotId: string; site: string | null; kind: 'written_off' | 'stocktake_adjustment' | 'move' } | null>(null)
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('spoiled')
  const [moveTo, setMoveTo] = useState('')
  if (!f.ready) return null
  const i = f.view.find((x) => x.id === id)
  if (!i) return <Page title="Not found" back={base}><p className="mt-4 text-muted">That feed isn't on this phone.</p></Page>
  const entries = f.data.ledger.filter((l) => i.lots.some((lot) => lot.id === l.feed_lot_id)).sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date)))
  const label: Record<string, string> = { purchased: 'Bought', produced: 'Made on farm', fed_out: 'Fed out', written_off: 'Written off', stocktake_adjustment: 'Stocktake', moved_between_sites: 'Moved' }

  async function saveAdjust() {
    if (!adjust) return
    const q = num(qty)
    if (q === null) return
    const lot = i!.lots.find((l) => l.id === adjust.lotId)!
    const now = lot.bySite.get(adjust.site) ?? 0
    if (adjust.kind === 'move') {
      const to = moveTo === 'none' ? null : moveTo
      if (!moveTo || to === adjust.site || q <= 0) return
      await saveAll(moveFeedPlan(adjust.lotId, adjust.site, to, Math.min(q, now), todayLocal()))
      setAdjust(null); setQty(''); setMoveTo('')
      return
    }
    const quantity = adjust.kind === 'written_off' ? -Math.abs(q) : Math.round((q - now) * 1000) / 1000
    if (quantity !== 0) await add('feed_ledger', { feed_lot_id: adjust.lotId, storage_site_id: adjust.site, entry_date: todayLocal(), entry_type: adjust.kind, quantity, write_off_reason: adjust.kind === 'written_off' ? reason : null })
    setAdjust(null); setQty('')
  }

  return (
    <Page title={i.name} kicker="Feed" back={base} action={<Button kind="secondary" className="shrink-0 px-4" onClick={() => go(`${base}/items/${id}/edit`)}>Edit</Button>}>
      <div className="mt-3 flex items-baseline gap-2"><span className="font-display text-4xl">{fmtFeed(i.onHand, i.unit)}</span><span className="text-muted">on hand</span></div>
      <p className="mt-1 text-sm text-muted">
        {[i.onHandKg !== null ? `${Math.round(i.onHandKg).toLocaleString('en-AU')} kg` : null, i.kgPerDay ? `${Math.round(i.kgPerDay).toLocaleString('en-AU')} kg/day at current rations` : null, i.daysLeft !== null ? `${i.daysLeft} days left` : null].filter(Boolean).join(' · ')}
      </p>
      <Button className="mt-4 w-full" onClick={() => go(`${base}/receive?item=${id}`)}>Feed received</Button>
      {i.lots.map((lot) => (
        <Section key={lot.id} title={`${lot.row.source === 'produced_on_farm' ? 'Made on farm' : 'Bought'} ${fmtDate(String(lot.row.received_date), { day: 'numeric', month: 'short', year: 'numeric' })}`} aside={<span className="text-sm font-semibold">{fmtFeed(lot.onHand, i.unit)}</span>}>
          {(lot.row.dry_matter_pct || lot.row.me_mj_kg || lot.row.crude_protein_pct) ? <p className="-mt-2 mb-2 text-sm text-muted">{[lot.row.dry_matter_pct ? `DM ${lot.row.dry_matter_pct}%` : null, lot.row.me_mj_kg ? `ME ${lot.row.me_mj_kg} MJ/kg` : null, lot.row.crude_protein_pct ? `CP ${lot.row.crude_protein_pct}%` : null].filter(Boolean).join(' · ')}</p> : null}
          <Card>
            {[...lot.bySite].map(([site, q]) => (
              <div key={site ?? 'none'} className="flex items-center gap-2 px-4 py-3">
                <span className="flex-1">{f.siteName(site)} · <b>{fmtFeed(q, i.unit)}</b></span>
                <button className="text-sm font-semibold text-green underline" onClick={() => { setAdjust({ lotId: lot.id, site, kind: 'move' }); setQty(String(q)); setMoveTo('') }}>Move</button>
                <button className="text-sm font-semibold text-alert underline" onClick={() => { setAdjust({ lotId: lot.id, site, kind: 'written_off' }); setQty('') }}>Write off</button>
                <button className="text-sm font-semibold text-green underline" onClick={() => { setAdjust({ lotId: lot.id, site, kind: 'stocktake_adjustment' }); setQty(String(q)) }}>Count</button>
              </div>
            ))}
          </Card>
          {adjust?.lotId === lot.id && (
            <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-line bg-card p-3">
              <Field id="q" label={adjust.kind === 'written_off' ? `How much to write off (${fmtFeed(2, i.unit).replace('2 ', '')})` : adjust.kind === 'move' ? `How much to move (${fmtFeed(2, i.unit).replace('2 ', '')})` : `How much is actually there`}>
                <input id="q" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} />
              </Field>
              {adjust.kind === 'move' && (
                <Field id="to" label={`From ${f.siteName(adjust.site)} to`}>
                  <select id="to" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className={inputClass}>
                    <option value="">Choose where</option>
                    {f.data.sites.filter((s) => s.id !== adjust.site).map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}
                    {adjust.site !== null && <option value="none">No site</option>}
                  </select>
                </Field>
              )}
              {adjust.kind === 'written_off' && (
                <Choice value={reason} onChange={setReason} options={[{ value: 'spoiled', label: 'Spoiled' }, { value: 'wet', label: 'Wet' }, { value: 'vermin', label: 'Vermin' }, { value: 'other', label: 'Other' }]} />
              )}
              <div className="flex gap-2"><Button className="flex-1" onClick={saveAdjust}>Save</Button><Button kind="secondary" onClick={() => setAdjust(null)}>Cancel</Button></div>
            </div>
          )}
        </Section>
      ))}
      {entries.length > 0 && (
        <Section title="Ledger">
          <Card>
            {entries.slice(0, 30).map((l) => (
              <div key={String(l.id)} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="w-14 shrink-0 text-muted">{fmtDate(String(l.entry_date))}</span>
                <span className="flex-1">{label[String(l.entry_type)]}{l.write_off_reason ? `: ${l.write_off_reason}` : ''} · {f.siteName(l.storage_site_id ? String(l.storage_site_id) : null)}</span>
                <span className={`font-semibold ${Number(l.quantity) < 0 ? 'text-alert' : 'text-green-deep'}`}>{Number(l.quantity) > 0 ? '+' : ''}{fmtFeed(Number(l.quantity), i.unit)}</span>
              </div>
            ))}
          </Card>
        </Section>
      )}
    </Page>
  )
}

// ---- Feed received --------------------------------------------------------------------

export function ReceiveFeed() {
  const f = useFeed()
  const { saveAll } = useSync()
  const { isOwner } = useFarm()
  const paddocks = useTable('paddocks') ?? []
  const [itemPick, setItem] = useState(query().get('item') ?? '')
  const itemId = itemPick || String(f.view[0]?.id ?? '')
  const item = f.view.find((i) => i.id === itemId)
  const [source, setSource] = useState<'purchased' | 'produced_on_farm'>('purchased')
  const [supplier, setSupplier] = useState('')
  const [newContacts, setNewContacts] = useState<NewRecord[]>([])
  const [paddock, setPaddock] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [qty, setQty] = useState('')
  const [site, setSite] = useState('')
  const [dm, setDm] = useState('')
  const [me, setMe] = useState('')
  const [cp, setCp] = useState('')
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!f.ready) return null
  if (f.view.length === 0) return <Page title="Feed received" back={base}><p className="mt-4 text-muted">Add the feed first (e.g. Pasture hay).</p><Button className="mt-4" onClick={() => go(`${base}/items/new`)}>Add a feed</Button></Page>

  async function save() {
    const q = num(qty)
    if (!q || q <= 0) return setError('How much came in?')
    const lotId = crypto.randomUUID()
    const ledgerId = crypto.randomUUID()
    const c = num(cost)
    await saveAll([
      ...newContacts,
      { table: 'feed_lots', values: { id: lotId, feed_item_id: itemId, source, supplier_contact_id: source === 'purchased' ? supplier || null : null, produced_from_paddock_id: source === 'produced_on_farm' ? paddock || null : null, received_date: date, dry_matter_pct: num(dm), me_mj_kg: num(me), crude_protein_pct: num(cp), notes: notes.trim() || null } },
      { table: 'feed_ledger', values: { id: ledgerId, feed_lot_id: lotId, storage_site_id: site || null, entry_date: date, entry_type: source === 'purchased' ? 'purchased' : 'produced', quantity: q } },
      ...(isOwner && c !== null ? [{ table: 'record_prices', values: { record_table: 'feed_lots', record_id: lotId, total_amount: c } }] : []),
    ])
    go(`${base}/items/${itemId}`)
  }

  return (
    <Page title="Feed received" kicker="Feed" back={base}>
      <div className="mt-5 flex flex-col gap-4">
        <Field id="item" label="Feed"><select id="item" value={itemId} onChange={(e) => setItem(e.target.value)} className={inputClass}>{f.view.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
        <Field id="source" label="Where from"><Choice value={source} onChange={setSource} options={[{ value: 'purchased', label: 'Bought' }, { value: 'produced_on_farm', label: 'Made on farm' }]} /></Field>
        {source === 'purchased'
          ? <ContactPicker id="supplier" label="Supplier" kind="supplier" value={supplier} onChange={setSupplier} newContacts={newContacts} setNewContacts={setNewContacts} />
          : <Field id="pdk" label="Cut from paddock"><select id="pdk" value={paddock} onChange={(e) => setPaddock(e.target.value)} className={inputClass}><option value="">Choose</option>{paddocks.map((d) => <option key={String(d.id)} value={String(d.id)}>{String(d.name)}</option>)}</select></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field id="qty" label={`Quantity (${item ? fmtFeed(2, item.unit).replace('2 ', '') : ''})`}><input id="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} /></Field>
          <Field id="site" label="Stored in"><select id="site" value={site} onChange={(e) => setSite(e.target.value)} className={inputClass}><option value="">Not set</option>{f.data.sites.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}</select></Field>
        </div>
        <DateField value={date} onChange={setDate} />
        <div className="grid grid-cols-3 gap-2">
          <Field id="dm" label="DM %"><input id="dm" inputMode="decimal" value={dm} onChange={(e) => setDm(e.target.value)} className={inputClass} /></Field>
          <Field id="me" label="ME MJ/kg"><input id="me" inputMode="decimal" value={me} onChange={(e) => setMe(e.target.value)} className={inputClass} /></Field>
          <Field id="cp" label="CP %"><input id="cp" inputMode="decimal" value={cp} onChange={(e) => setCp(e.target.value)} className={inputClass} /></Field>
        </div>
        <p className="-mt-2 text-xs text-muted">Feed test results, if you have them (optional).</p>
        {isOwner && <Field id="cost" label="Cost, including GST ($)" hint="Only owners can see prices."><input id="cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} /></Field>}
        <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save}>Add to feed on hand</Button>
      </div>
    </Page>
  )
}

// ---- Storage sites ----------------------------------------------------------------------

export function SiteFormScreen({ id }: { id?: string }) {
  const sites = useTable('feed_storage_sites')
  const properties = useTable('properties') ?? []
  const { add, edit } = useSync()
  const site = id ? sites?.find((s) => s.id === id) : undefined
  const [name, setName] = useState(str(site?.name))
  const [type, setType] = useState(str(site?.site_type) || 'hay_shed')
  const [prop, setProp] = useState(str(site?.property_id))
  const [cap, setCap] = useState(str(site?.capacity))
  const [capUnit, setCapUnit] = useState(str(site?.capacity_unit))
  if (!sites) return null
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const values = { name: name.trim(), site_type: type, property_id: prop || properties[0]?.id || null, capacity: num(cap), capacity_unit: capUnit.trim() || null }
    if (site) await edit('feed_storage_sites', String(site.id), values)
    else await add('feed_storage_sites', values)
    go(base)
  }
  return (
    <Page title={site ? 'Edit storage' : 'New storage'} kicker="Feed" back={base}>
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <Field id="name" label="Name"><input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Hay shed" /></Field>
        <Field id="type" label="Type"><select id="type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>{SITE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
        {properties.length > 1 && <Field id="prop" label="Property"><select id="prop" value={prop} onChange={(e) => setProp(e.target.value)} className={inputClass}>{properties.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}</select></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field id="cap" label="Holds"><input id="cap" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} className={inputClass} placeholder="e.g. 300" /></Field>
          <Field id="capu" label="Of"><input id="capu" value={capUnit} onChange={(e) => setCapUnit(e.target.value)} className={inputClass} placeholder="e.g. round bales" /></Field>
        </div>
        <p className="-mt-2 text-xs text-muted">How much it can hold (optional), e.g. 300 round bales, 40 t of grain, 2,000 square bales.</p>
        <Button type="submit">Save</Button>
      </form>
      {site && <Button kind="danger" className="mt-10 w-full" onClick={() => { edit('feed_storage_sites', String(site.id), { archived_at: nowIso() }); go(base) }}>Archive</Button>}
    </Page>
  )
}

// ---- Rations -------------------------------------------------------------------------------

export function RationScreen({ id }: { id?: string }) {
  const f = useFeed()
  if (!f.ready) return null
  const ration = id ? f.data.rations.find((r) => r.id === id) : undefined
  if (id && !ration) return <Page title="Not found" back={base}><p className="mt-4 text-muted">That ration isn't on this phone.</p></Page>
  return <RationForm key={id ?? 'new'} f={f} ration={ration} />
}

function RationForm({ f, ration }: { f: ReturnType<typeof useFeed>; ration?: Row }) {
  const { saveAll, edit } = useSync()
  const mine = ration ? f.data.rationItems.filter((ri) => ri.ration_id === ration.id && !ri.deleted_at) : []
  const [name, setName] = useState(str(ration?.name))
  const [every, setEvery] = useState(String(everyOf(ration)))
  const blank = { id: '', item: '', kg: '', basis: 'kg_per_head' as Basis }
  const [rows, setRows] = useState(() => mine.length ? mine.map((ri) => ({ id: String(ri.id), item: String(ri.feed_item_id), kg: String(Math.round(amountEachFeed(ri, ration) * 100) / 100), basis: basisOf(ri) })) : [blank])
  const [assignMob, setAssignMob] = useState('')
  const [assignDate, setAssignDate] = useState(todayLocal())
  const [error, setError] = useState<string | null>(null)
  const today = todayLocal()
  const assigned = ration ? f.data.assignments.filter((a) => a.ration_id === ration.id && (!a.end_date || String(a.end_date) >= today)) : []

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Name the ration, e.g. Hay + lick.')
    const good = rows.filter((r) => r.item && num(r.kg))
    if (good.length === 0) return setError('Add at least one feed and how much each feed.')
    const days = Math.max(1, Math.round(num(every) ?? 1))
    const id = ration ? String(ration.id) : crypto.randomUUID()
    const keep = new Set(good.map((r) => r.id).filter(Boolean))
    // kg per head per day is kept for kg rations, for older phones and reports.
    const itemValues = (r: typeof blank) => ({
      feed_item_id: r.item, amount: num(r.kg), amount_basis: r.basis,
      kg_per_head_per_day: r.basis === 'kg_per_head' ? Math.round((num(r.kg)! / days) * 100) / 100 : null,
    })
    await saveAll(
      [
        ...(ration ? [] : [{ table: 'rations', values: { id, name: name.trim(), feed_every_days: days } }]),
        ...good.filter((r) => !r.id).map((r) => ({ table: 'ration_items', values: { ration_id: id, ...itemValues(r) } })),
      ],
      [
        ...(ration ? [{ table: 'rations', id, changes: { name: name.trim(), feed_every_days: days } }] : []),
        ...good.filter((r) => r.id).map((r) => ({ table: 'ration_items', id: r.id, changes: itemValues(r) })),
        ...mine.filter((ri) => !keep.has(String(ri.id))).map((ri) => ({ table: 'ration_items', id: String(ri.id), changes: { deleted_at: nowIso() } })),
      ],
    )
    go(`${base}/rations/${id}`)
  }

  return (
    <Page title={ration ? str(ration.name) : 'New ration'} kicker="Ration" back={base}>
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <Field id="name" label="Name"><input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Hay + lick" /></Field>
        <Field id="every" label="Fed">
          <select id="every" value={[1, 2, 3, 7].includes(Number(every)) ? every : 'other'} onChange={(e) => setEvery(e.target.value === 'other' ? '4' : e.target.value)} className={inputClass}>
            <option value="1">Every day</option><option value="2">Every 2 days</option><option value="3">Every 3 days</option><option value="7">Once a week</option><option value="other">Every … days</option>
          </select>
        </Field>
        {![1, 2, 3, 7].includes(Number(every)) && (
          <Field id="days" label="Every how many days"><input id="days" inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value.replace(/\D/g, ''))} className={inputClass} /></Field>
        )}
        <div className="text-sm font-semibold text-muted">Each feed</div>
        {rows.map((r, n) => {
          const item = f.view.find((i) => i.id === r.item)
          const set = (c: Partial<typeof blank>) => setRows(rows.map((x, j) => (j === n ? { ...x, ...c } : x)))
          const unitWord = item ? fmtFeed(2, item.unit).replace('2 ', '') : 'units'
          return (
            <div key={n} className="rounded-2xl border border-line bg-card p-3">
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <select aria-label="Feed" value={r.item} onChange={(e) => {
                  const it = f.view.find((i) => i.id === e.target.value)
                  // Bales are usually given whole to the mob.
                  set({ item: e.target.value, basis: it && isBales(it.unit) && !r.kg ? 'units_per_mob' : r.basis })
                }} className={inputClass}>
                  <option value="">Choose a feed</option>{f.view.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <button type="button" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== n))} className="h-12 px-2 text-muted">×</button>
              </div>
              <div className="mt-2 grid grid-cols-[6rem_1fr] gap-2">
                <input aria-label="How much each feed" inputMode="decimal" value={r.kg} onChange={(e) => set({ kg: e.target.value })} className={inputClass} placeholder={r.basis === 'kg_per_head' ? 'kg' : 'how many'} />
                <select aria-label="Measured as" value={r.basis} onChange={(e) => set({ basis: e.target.value as Basis })} className={inputClass}>
                  <option value="kg_per_head">kg per head</option>
                  <option value="units_per_mob">{item?.unit === 'kg' ? 'kg' : unitWord} to the mob</option>
                </select>
              </div>
            </div>
          )
        })}
        <p className="-mt-2 text-xs text-muted">e.g. 2 round bales to the mob every 3 days, or 6 kg per head every day.</p>
        <Button kind="secondary" onClick={() => setRows([...rows, blank])}>+ Another feed</Button>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button type="submit">Save ration</Button>
      </form>
      {ration && (
        <Section title="Mobs on this ration">
          {assigned.length > 0 && (
            <Card>
              {assigned.map((a) => (
                <ListRow key={String(a.id)} label={f.stock.mobName(String(a.mob_id))} detail={`Since ${fmtDate(String(a.start_date))}`}
                  value={<button className="text-sm font-semibold text-alert underline" onClick={() => edit('ration_assignments', String(a.id), { end_date: today })}>Stop</button>} />
              ))}
            </Card>
          )}
          <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
            <select aria-label="Mob" value={assignMob} onChange={(e) => setAssignMob(e.target.value)} className={inputClass}>
              <option value="">Put a mob on this ration</option>
              {f.stock.mobs.filter((m) => m.head > 0 && !assigned.some((a) => a.mob_id === m.id)).map((m) => <option key={m.id} value={m.id}>{m.name} · {m.head} hd</option>)}
            </select>
            <Button disabled={!assignMob} onClick={async () => {
              // Moving a mob onto this ration ends any other ration it's on.
              const others = f.data.assignments.filter((a) => a.mob_id === assignMob && (!a.end_date || String(a.end_date) >= today))
              await saveAll([{ table: 'ration_assignments', values: { ration_id: ration.id, mob_id: assignMob, start_date: assignDate } }],
                others.map((a) => ({ table: 'ration_assignments', id: String(a.id), changes: { end_date: assignDate } })))
              setAssignMob('')
            }}>Add</Button>
          </div>
          <div className="mt-2"><DateField value={assignDate} onChange={setAssignDate} /></div>
        </Section>
      )}
    </Page>
  )
}

// ---- Feeding a mob ---------------------------------------------------------------------------

export function FeedMob() {
  const f = useFeed()
  if (!f.ready) return null
  return <FeedMobForm f={f} />
}

function FeedMobForm({ f }: { f: ReturnType<typeof useFeed> }) {
  const { saveAll } = useSync()
  const [mobPick, setMob] = useState(query().get('mob') ?? '')
  const mobs = f.stock.mobs.filter((m) => m.head > 0)
  const mobId = mobPick || mobs[0]?.id || ''
  const mob = f.stock.mob(mobId)
  const ration = mobId ? f.rationOf(mobId) : null
  const [rationPick, setRation] = useState<string | null>(null)
  const rationId = rationPick ?? (ration ? String(ration.id) : '')
  const [head, setHead] = useState<string | null>(null)
  const heads = Number(head ?? mob?.head ?? 0)
  const [date, setDate] = useState(todayLocal())
  const [edited, setEdited] = useState<FeedLine[] | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  // No ration (e.g. a lick put out): start with one feed to choose.
  const suggested = rationId ? suggestFeeding(f.data, f.view, rationId, heads) : [{ itemId: '', lotId: '', siteId: null, quantity: 0 }]
  const lines = edited ?? suggested
  const setLine = (n: number, c: Partial<FeedLine>) => setEdited(lines.map((l, j) => (j === n ? { ...l, ...c } : l)))

  async function save() {
    if (!mob) return setError('Choose the mob fed.')
    if (lines.filter((l) => l.lotId && l.quantity > 0).length === 0) return setError('Add what was fed.')
    await saveAll(feedingPlan({ mobId, date, rationId: rationId || null, head: heads, paddockId: mob.location?.paddockId ?? null, notes: notes.trim() || null, lines }))
    go(base)
  }

  return (
    <Page title="Feed a mob" kicker="Feed" back={base}>
      <div className="mt-5 flex flex-col gap-4">
        <Field id="mob" label="Mob"><select id="mob" value={mobId} onChange={(e) => { setMob(e.target.value); setRation(null); setHead(null); setEdited(null) }} className={inputClass}>{mobs.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.head} hd</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="ration" label="Ration"><select id="ration" value={rationId} onChange={(e) => { setRation(e.target.value); setEdited(null) }} className={inputClass}><option value="">No ration</option>{f.data.rations.map((r) => <option key={String(r.id)} value={String(r.id)}>{String(r.name)}</option>)}</select></Field>
          <Field id="head" label="Head fed"><input id="head" inputMode="numeric" value={head ?? String(mob?.head ?? '')} onChange={(e) => { setHead(e.target.value.replace(/\D/g, '')); setEdited(null) }} className={inputClass} /></Field>
        </div>
        <DateField value={date} onChange={setDate} />
        <div className="text-sm font-semibold text-muted">Fed out {rationId && !edited ? `(one feed of ${String(f.data.rations.find((r) => r.id === rationId)?.name ?? 'the ration')}; change if needed)` : ''}</div>
        {lines.map((l, n) => {
          const item = f.view.find((i) => i.id === l.itemId)
          return (
            <div key={n} className="rounded-2xl border border-line bg-card p-3">
              <select aria-label="Feed" value={l.itemId} onChange={(e) => {
                const it = f.view.find((i) => i.id === e.target.value)
                const lot = it?.lots.find((x) => x.onHand > 0) ?? it?.lots[0]
                setLine(n, { itemId: e.target.value, lotId: lot?.id ?? '', siteId: lot ? [...lot.bySite].find(([, q]) => q > 0)?.[0] ?? null : null, quantity: l.quantity || (it && isBales(it.unit) ? 1 : 0) })
              }} className={inputClass}>
                <option value="">Choose a feed</option>{f.view.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-2">
                <button type="button" aria-label="One less" onClick={() => setLine(n, { quantity: Math.max(0, (l.quantity || 0) - (item && isBales(item.unit) ? 1 : item?.unit === 't' ? 0.5 : 5)) })} className="size-12 rounded-xl border border-line text-xl font-bold">−</button>
                <input aria-label="Quantity" inputMode="decimal" value={String(l.quantity || '')} onChange={(e) => setLine(n, { quantity: num(e.target.value) ?? 0 })} className={`${inputClass} text-center`} placeholder={item ? fmtFeed(2, item.unit).replace('2 ', '') : 'How much'} />
                <button type="button" aria-label="One more" onClick={() => setLine(n, { quantity: (l.quantity || 0) + (item && isBales(item.unit) ? 1 : item?.unit === 't' ? 0.5 : 5) })} className="size-12 rounded-xl border border-line text-xl font-bold">+</button>
              </div>
              {item && <div className="mt-2 text-xs text-muted">{fmtFeed(l.quantity, item.unit)}{kgPerUnit(item.row) ? ` (${Math.round(l.quantity * kgPerUnit(item.row)!)} kg)` : ''} · {item.lots.length > 1 ? (
                <select aria-label="From which lot" value={l.lotId} onChange={(e) => setLine(n, { lotId: e.target.value })} className="bg-transparent underline">
                  {item.lots.map((lot) => <option key={lot.id} value={lot.id}>{fmtDate(String(lot.row.received_date))} lot ({fmtFeed(lot.onHand, item.unit)})</option>)}
                </select>) : `${fmtFeed(item.onHand, item.unit)} on hand`}</div>}
              {item && (item.row.whp_days != null || item.row.esi_days != null) && l.quantity > 0 && (
                <div className="mt-2"><Notice tone="warn">{item.name} has a withhold (WHP {str(item.row.whp_days) || '0'} days{item.row.esi_days != null ? `, ESI ${item.row.esi_days} days` : ''}). Feeding it puts {mob?.name ?? 'the mob'} under withhold.</Notice></div>
              )}
            </div>
          )
        })}
        <Button kind="secondary" onClick={() => setEdited([...lines, { itemId: '', lotId: '', siteId: null, quantity: 0 }])}>+ Another feed</Button>
        <Field id="notes" label="Notes"><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button onClick={save}>Save feeding</Button>
      </div>
    </Page>
  )
}

export function FeedingScreen({ id }: { id: string }) {
  const f = useFeed()
  const { remove } = useSync()
  const [confirm, setConfirm] = useState(false)
  if (!f.ready) return null
  const fe = f.data.feedings!.find((x) => x.id === id && !x.deleted_at)
  if (!fe) return <Page title="Not found" back={base}><p className="mt-4 text-muted">That feeding has been deleted or isn't on this phone.</p></Page>
  const lines = f.data.ledger.filter((l) => l.feeding_event_id === id)
  return (
    <Page title={`Fed ${f.stock.mobName(String(fe.mob_id))}`} kicker="Feeding" back={base}>
      <p className="mt-2 text-muted">{fmtDate(String(fe.feed_date), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}{fe.head_fed ? ` · ${fe.head_fed} hd` : ''}{fe.notes ? ` · ${fe.notes}` : ''}</p>
      <div className="mt-4"><Card>{lines.map((l) => {
        const lot = f.data.lots.find((x) => x.id === l.feed_lot_id)
        const item = f.view.find((i) => i.id === lot?.feed_item_id)
        return <ListRow key={String(l.id)} label={item?.name ?? 'Feed'} value={item ? fmtFeed(Math.abs(Number(l.quantity)), item.unit) : String(l.quantity)} />
      })}</Card></div>
      <div className="mt-8">
        {confirm ? (
          <div className="flex gap-2">
            <Button kind="danger" className="flex-1" onClick={async () => { await remove('feeding_events', id); go(base) }}>Yes, delete it</Button>
            <Button kind="secondary" onClick={() => setConfirm(false)}>Keep</Button>
          </div>
        ) : <Button kind="danger" className="w-full" onClick={() => setConfirm(true)}>Delete this feeding (feed goes back on hand)</Button>}
      </div>
    </Page>
  )
}
