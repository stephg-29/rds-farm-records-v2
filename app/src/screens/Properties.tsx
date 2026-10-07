// Setup: properties (with PICs) and their paddocks.
import { useState, type FormEvent } from 'react'
import type { Row } from '../lib/db'
import { paddockHistory } from '../lib/land'
import { ndviWords, paddockNdviHistory } from '../lib/ndvi'
import { mobHeads, paddockRest, todayLocal } from '../lib/stock'
import { useHealth } from '../lib/useHealth'
import { useStock } from '../lib/useStock'
import { useSync, useTable } from '../lib/useSync'
import { Button, Card, Choice, Empty, Field, Notice, Page, Row as ListRow, Section, go, inputClass, nowIso } from '../ui'

const byName = (a: Row, b: Row) => String(a.name).localeCompare(String(b.name), 'en-AU', { numeric: true })
const clean = (s: string) => s.trim().replace(/\s+/g, ' ')

// PICs are 8 letters and numbers (e.g. NA123456). Only a warning: formats
// differ between states.
export function picWarning(pic: string): string | null {
  if (!pic) return null
  return /^[A-Z0-9]{8}$/.test(pic) ? null : 'PICs are usually 8 letters and numbers, e.g. NA123456. Check it before saving.'
}

function ha(v: unknown) {
  return v === null || v === undefined || v === '' ? null : `${Number(v).toLocaleString('en-AU', { maximumFractionDigits: 1 })} ha`
}

// ---- Property list --------------------------------------------------------

export function PropertyList() {
  const properties = useTable('properties')
  const paddocks = useTable('paddocks')
  const [showArchived, setShowArchived] = useState(false)
  const list = (properties ?? []).filter((p) => showArchived || !p.archived_at).sort(byName)
  const archivedCount = (properties ?? []).filter((p) => p.archived_at).length

  return (
    <Page title="Properties and paddocks" kicker="Paddocks" back="/paddocks"
      action={<Button onClick={() => go('/setup/properties/new')} className="shrink-0">Add</Button>}>
      <p className="mt-3 text-muted">Each property with its PIC, and the paddocks on it.</p>
      <div className="mt-6">
        {properties && list.length === 0 && <Empty>No properties yet. Add your first one.</Empty>}
        {list.length > 0 && (
          <Card>
            {list.map((p) => {
              const n = (paddocks ?? []).filter((d) => d.property_id === p.id && !d.archived_at).length
              return (
                <ListRow key={String(p.id)} onClick={() => go(`/setup/properties/${p.id}`)} muted={!!p.archived_at}
                  label={String(p.name)}
                  detail={[p.pic || 'No PIC', p.is_own === false ? 'Leased or agisted' : null, p.archived_at ? 'Archived' : null].filter(Boolean).join(' · ')}
                  value={`${n} ${n === 1 ? 'paddock' : 'paddocks'}`} />
              )
            })}
          </Card>
        )}
      </div>
      {archivedCount > 0 && (
        <button onClick={() => setShowArchived(!showArchived)} className="mt-4 text-sm font-medium text-muted underline">
          {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
        </button>
      )}
    </Page>
  )
}

// ---- One property ---------------------------------------------------------

export function PropertyScreen({ id }: { id: string }) {
  const properties = useTable('properties')
  if (!properties) return null
  if (id === 'new') return <PropertyForm properties={properties} />
  const p = properties.find((x) => x.id === id)
  if (!p) return <Page title="Not found" back="/setup/properties"><p className="mt-4 text-muted">That property isn't on this phone.</p></Page>
  return <PropertyForm key={id} property={p} properties={properties} />
}

function PropertyForm({ property, properties }: { property?: Row; properties: Row[] }) {
  const { add, edit } = useSync()
  const [name, setName] = useState(String(property?.name ?? ''))
  const [pic, setPic] = useState(String(property?.pic ?? ''))
  const [address, setAddress] = useState(String(property?.address ?? ''))
  const [own, setOwn] = useState<'own' | 'leased'>(property?.is_own === false ? 'leased' : 'own')
  const [notes, setNotes] = useState(String(property?.notes ?? ''))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    const values = { name: clean(name), pic: pic.trim().toUpperCase().replace(/\s/g, '') || null, address: address.trim() || null, is_own: own === 'own', notes: notes.trim() || null }
    if (!values.name) return setError('Give the property a name.')
    if (properties.some((p) => p.id !== property?.id && !p.archived_at && String(p.name).toLowerCase() === values.name.toLowerCase())) {
      return setError(`There's already a property called ${values.name}.`)
    }
    setError(null)
    if (property) {
      await edit('properties', String(property.id), values)
      setSaved(true)
    } else {
      const id = await add('properties', values)
      go(`/setup/properties/${id}`)
    }
  }

  const warning = picWarning(pic.trim().toUpperCase().replace(/\s/g, ''))
  const archived = !!property?.archived_at

  return (
    <Page title={property ? String(property.name) : 'New property'} kicker="Property" back="/setup/properties">
      {archived && <div className="mt-4"><Notice tone="warn">This property is archived. It's hidden from lists, but all its records are kept.</Notice></div>}
      <form onSubmit={save} onChange={() => setSaved(false)} className="mt-6 flex flex-col gap-4">
        <Field id="name" label="Name">
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Kooringa" />
        </Field>
        <Field id="pic" label="PIC" hint={warning ?? 'Property Identification Code, from your state.'}>
          <input id="pic" value={pic} onChange={(e) => setPic(e.target.value)} className={`${inputClass} uppercase placeholder:normal-case`} placeholder="e.g. NA123456" autoCapitalize="characters" />
        </Field>
        <Field id="own" label="Held as">
          <Choice value={own} onChange={(v) => { setOwn(v); setSaved(false) }} options={[{ value: 'own', label: 'Owned' }, { value: 'leased', label: 'Leased or agisted' }]} />
        </Field>
        <Field id="address" label="Address">
          <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        </Field>
        <Field id="notes" label="Notes">
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputClass} h-auto py-3`} />
        </Field>
        {error && <Notice tone="alert">{error}</Notice>}
        {saved && <Notice tone="ok">Saved.</Notice>}
        <Button type="submit">{property ? 'Save changes' : 'Add property'}</Button>
      </form>

      {property && <PaddockSection propertyId={String(property.id)} />}

      {property && (
        <div className="mt-10">
          {archived
            ? <Button kind="secondary" className="w-full" onClick={() => edit('properties', String(property.id), { archived_at: null })}>Restore property</Button>
            : <Button kind="danger" className="w-full" onClick={() => { edit('properties', String(property.id), { archived_at: nowIso() }); go('/setup/properties') }}>Archive property</Button>}
          <p className="mt-2 text-center text-xs text-muted">Archiving hides it from lists. Nothing is deleted, and it can be restored.</p>
        </div>
      )}
    </Page>
  )
}

// ---- Paddocks on a property -----------------------------------------------

function PaddockSection({ propertyId }: { propertyId: string }) {
  const paddocks = useTable('paddocks')
  const { add } = useSync()
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const mine = (paddocks ?? []).filter((d) => d.property_id === propertyId).sort(byName)
  const list = mine.filter((d) => showArchived || !d.archived_at)
  const archivedCount = mine.filter((d) => d.archived_at).length

  async function addPaddock(e: FormEvent) {
    e.preventDefault()
    const n = clean(name)
    if (!n) return setError('Give the paddock a name.')
    if (mine.some((d) => !d.archived_at && String(d.name).toLowerCase() === n.toLowerCase())) return setError(`There's already a paddock called ${n}.`)
    const a = area.trim() === '' ? null : Number(area)
    if (a !== null && !(a > 0)) return setError('Area should be a number of hectares, e.g. 42.5.')
    setError(null)
    await add('paddocks', { property_id: propertyId, name: n, area_ha: a, area_overridden: a !== null })
    setName('')
    setArea('')
  }

  return (
    <Section title="Paddocks" aside={<span className="text-sm text-muted">{mine.length - archivedCount}</span>}>
      <form onSubmit={addPaddock} className="mb-3 flex flex-col gap-2 rounded-2xl border border-line bg-card p-3">
        <input aria-label="New paddock name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Paddock name, e.g. Eastern Rye" className={inputClass} />
        <div className="flex gap-2">
          <div className="relative w-36 shrink-0">
            <input aria-label="Area in hectares (optional)" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area" inputMode="decimal" className={`${inputClass} pr-10`} />
            <span aria-hidden className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">ha</span>
          </div>
          <Button type="submit" className="flex-1">Add paddock</Button>
        </div>
      </form>
      {error && <div className="mb-3"><Notice tone="alert">{error}</Notice></div>}
      {paddocks && list.length === 0 && <Empty>No paddocks yet. Add them above, or draw them on the map later.</Empty>}
      {list.length > 0 && (
        <Card>
          {list.map((d) => (
            <ListRow key={String(d.id)} onClick={() => go(`/setup/paddocks/${d.id}`)} muted={!!d.archived_at}
              label={String(d.name)} detail={d.archived_at ? 'Archived' : undefined} value={ha(d.area_ha) ?? ''} />
          ))}
        </Card>
      )}
      {archivedCount > 0 && (
        <button onClick={() => setShowArchived(!showArchived)} className="mt-3 text-sm font-medium text-muted underline">
          {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
        </button>
      )}
    </Section>
  )
}

export function PaddockScreen({ id }: { id: string }) {
  const paddocks = useTable('paddocks')
  const properties = useTable('properties')
  if (!paddocks || !properties) return null
  const d = paddocks.find((x) => x.id === id)
  if (!d) return <Page title="Not found" back="/setup/properties"><p className="mt-4 text-muted">That paddock isn't on this phone.</p></Page>
  return <PaddockForm key={id} paddock={d} siblings={paddocks.filter((x) => x.property_id === d.property_id)}
    propertyName={String(properties.find((p) => p.id === d.property_id)?.name ?? '')} />
}

function PaddockForm({ paddock, siblings, propertyName }: { paddock: Row; siblings: Row[]; propertyName: string }) {
  const { edit } = useSync()
  const [name, setName] = useState(String(paddock.name))
  const [area, setArea] = useState(paddock.area_ha === null || paddock.area_ha === undefined ? '' : String(paddock.area_ha))
  const [notes, setNotes] = useState(String(paddock.notes ?? ''))
  const [error, setError] = useState<string | null>(null)
  const back = `/setup/properties/${paddock.property_id}`
  const archived = !!paddock.archived_at

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = clean(name)
    if (!n) return setError('Give the paddock a name.')
    if (siblings.some((d) => d.id !== paddock.id && !d.archived_at && String(d.name).toLowerCase() === n.toLowerCase())) return setError(`There's already a paddock called ${n}.`)
    const a = area.trim() === '' ? null : Number(area)
    if (a !== null && !(a > 0)) return setError('Area should be a number of hectares, e.g. 42.5.')
    await edit('paddocks', String(paddock.id), { name: n, area_ha: a, area_overridden: a !== null, notes: notes.trim() || null })
    go(back)
  }

  return (
    <Page title={String(paddock.name)} kicker={propertyName} back={back}>
      {archived && <div className="mt-4"><Notice tone="warn">This paddock is archived. Its history is kept.</Notice></div>}
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <Field id="name" label="Name">
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field id="area" label="Area (ha)" hint="Worked out from the map once the paddock is drawn. Anything typed here is kept instead.">
          <input id="area" value={area} onChange={(e) => setArea(e.target.value)} inputMode="decimal" className={inputClass} />
        </Field>
        <Field id="notes" label="Notes">
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputClass} h-auto py-3`} />
        </Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button type="submit">Save changes</Button>
      </form>
      <PaddockGrowth paddock={paddock} />
      <PaddockHistory paddock={paddock} />
      <div className="mt-10">
        {archived
          ? <Button kind="secondary" className="w-full" onClick={() => edit('paddocks', String(paddock.id), { archived_at: null })}>Restore paddock</Button>
          : <Button kind="danger" className="w-full" onClick={() => { edit('paddocks', String(paddock.id), { archived_at: nowIso() }); go(back) }}>Archive paddock</Button>}
        <p className="mt-2 text-center text-xs text-muted">Archiving hides it from lists. Its history is kept, and it can be restored.</p>
      </div>
    </Page>
  )
}

// Everything on this paddock: grazing, sprays, fertiliser, pasture work, issues.
// NDVI from each clear satellite pass (saved when someone opens the NDVI
// layer on the map), as bars, newest first.
function PaddockGrowth({ paddock }: { paddock: Row }) {
  const history = paddockNdviHistory(useTable('readings') ?? [], String(paddock.id)).slice(0, 12)
  if (history.length === 0) return null
  return (
    <Section title="Pasture growth (NDVI)">
      <Card>
        {history.map((h) => (
          <div key={h.date} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="w-16 shrink-0 text-muted">{new Date(h.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper"><span className="block h-full rounded-full bg-green" style={{ width: `${Math.max(2, Math.min(100, h.ndvi * 100))}%` }} /></span>
            <span className="w-28 shrink-0 text-right"><b>{h.ndvi.toFixed(2)}</b> {ndviWords(h.ndvi)}</span>
          </div>
        ))}
      </Card>
      <p className="mt-2 text-xs text-muted">From Sentinel-2 satellite passes (Digital Earth Australia), cloud-free parts of the paddock only. 0 is bare ground; 0.8+ is dense green pasture.</p>
    </Section>
  )
}

function PaddockHistory({ paddock }: { paddock: Row }) {
  const stock = useStock()
  const health = useHealth(stock.mobName)
  const sprays = useTable('spray_records') ?? []
  const sprayPaddocks = useTable('spray_record_paddocks') ?? []
  const sprayItems = useTable('spray_record_items') ?? []
  const pastures = useTable('pasture_records') ?? []
  const pasturePaddocks = useTable('pasture_record_paddocks') ?? []
  const pastureItems = useTable('pasture_record_items') ?? []
  const issues = useTable('issues') ?? []
  const pid = String(paddock.id)
  const rest = paddockRest(stock.data, pid, todayLocal(), mobHeads(stock.data))
  const live = new Set(stock.data.events.filter((e) => !e.deleted_at).map((e) => String(e.id)))
  const grazing = stock.data.locations.filter((c) => c.paddock_id === pid && !c.deleted_at && live.has(String(c.stock_event_id))).map((c) => {
    const e = stock.data.events.find((x) => x.id === c.stock_event_id)!
    return { date: String(e.event_date), text: `${stock.mobName(String(c.mob_id))} moved in`, path: `/stock/${c.mob_id}` }
  })
  const events = paddockHistory(pid, String(paddock.property_id), { sprays, sprayPaddocks, sprayItems, pastures, pasturePaddocks, pastureItems, issues, productName: health.productName, grazing })
  return (
    <Section title="History">
      <p className="-mt-1 mb-3 text-sm text-muted">
        {rest.grazing.length > 0 ? `Grazing now: ${rest.grazing.map(stock.mobName).join(', ')}.` : rest.restedDays !== null ? `Rested ${rest.restedDays} days.` : 'No grazing recorded yet.'}
      </p>
      {events.length === 0 ? <Empty>Nothing recorded on this paddock yet.</Empty> : (
        <Card>
          {events.slice(0, 40).map((h, i) => (
            <button key={i} onClick={() => go(h.path)} className="flex w-full gap-4 px-4 py-3 text-left active:bg-paper">
              <span className="w-20 shrink-0 text-sm text-muted">{new Date(`${h.date}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
              <span className="min-w-0 flex-1 text-sm">{h.text}</span>
            </button>
          ))}
        </Card>
      )}
    </Section>
  )
}
