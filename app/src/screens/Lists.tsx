// Setup: the dropdown lists people pick from, and livestock classes.
import { useState, type FormEvent } from 'react'
import type { Row } from '../lib/db'
import { useFarm } from '../lib/useFarm'
import { useSync, useTable } from '../lib/useSync'
import { Button, Card, Choice, Empty, Notice, Page, Row as ListRow, Section, go, inputClass, nowIso } from '../ui'

// The lists the app uses, which module each belongs to, and what it's for.
export const PICK_LISTS: { name: string; label: string; module: string; about: string }[] = [
  { name: 'treatment_reason', label: 'Treatment reasons', module: 'treatments', about: 'Why stock were treated.' },
  { name: 'treatment_route', label: 'Treatment routes', module: 'treatments', about: 'How a treatment was given.' },
  { name: 'issue_category', label: 'Issue types', module: 'issues', about: 'What can be reported from the map.' },
  { name: 'vehicle_service_type', label: 'Vehicle service types', module: 'vehicles', about: 'The kind of service or repair.' },
  { name: 'vehicle_work_done', label: 'Vehicle work done', module: 'vehicles', about: 'The tick boxes on a vehicle service.' },
]

const clean = (s: string) => s.trim().replace(/\s+/g, ' ')
const ordered = (a: Row, b: Row) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || String(a.value ?? a.name).localeCompare(String(b.value ?? b.name))

export function PickListMenu() {
  const items = useTable('pick_lists')
  const { modules } = useFarm()
  const status = (key: string) => modules.find((m) => m.key === key)?.status
  const shown = PICK_LISTS.filter((l) => status(l.module) !== 'locked' && status(l.module) !== undefined)

  return (
    <Page title="Dropdown lists" kicker="Setup" back="/setup">
      <p className="mt-3 text-muted">The choices people pick from when they record something. Every list also allows typing something new.</p>
      <div className="mt-6">
        <Card>
          {shown.map((l) => {
            const n = (items ?? []).filter((i) => i.list_name === l.name && !i.archived_at).length
            if (status(l.module) === 'off') return <ListRow key={l.name} onClick={() => go('/setup/modules')} label={l.label} detail="Its module is switched off. Turn it on in More, Modules." muted />
            return <ListRow key={l.name} onClick={() => go(`/setup/lists/${l.name}`)} label={l.label} detail={l.about} value={String(n)} />
          })}
          <ListRow onClick={() => go('/setup/classes')} label="Livestock classes" detail="Cows, heifers, steers, ewes and so on." />
        </Card>
      </div>
    </Page>
  )
}

// ---- One pick list ----------------------------------------------------------

export function PickListScreen({ name }: { name: string }) {
  const info = PICK_LISTS.find((l) => l.name === name)
  const items = useTable('pick_lists')
  const { add, edit } = useSync()
  const [value, setValue] = useState('')
  const [error, setError] = useState<{ text: string; restore?: Row } | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  if (!info) return <Page title="Not found" back="/setup/lists"><p className="mt-4 text-muted">There's no list called that.</p></Page>

  const all = (items ?? []).filter((i) => i.list_name === name).sort(ordered)
  const live = all.filter((i) => !i.archived_at)
  const archived = all.filter((i) => i.archived_at)
  const same = (v: string) => all.find((i) => String(i.value).toLowerCase() === v.toLowerCase())

  async function addItem(e: FormEvent) {
    e.preventDefault()
    const v = clean(value)
    if (!v) return
    const existing = same(v)
    if (existing) {
      return setError(existing.archived_at
        ? { text: `${existing.value} is in the archived items.`, restore: existing }
        : { text: `${existing.value} is already in the list.` })
    }
    setError(null)
    const last = live.at(-1)
    await add('pick_lists', { list_name: name, value: v, sort_order: Number(last?.sort_order ?? 0) + 10 })
    setValue('')
  }

  // Move an item up or down by renumbering the list in tens.
  async function move(item: Row, by: -1 | 1) {
    const list = [...live]
    const i = list.findIndex((x) => x.id === item.id)
    const j = i + by
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    for (const [k, row] of list.entries()) {
      const order = (k + 1) * 10
      if (Number(row.sort_order) !== order) await edit('pick_lists', String(row.id), { sort_order: order })
    }
  }

  return (
    <Page title={info.label} kicker="Dropdown list" back="/setup/lists">
      <p className="mt-3 text-muted">{info.about} Renaming an item doesn't change records already saved.</p>
      <form onSubmit={addItem} className="mt-6 flex gap-2">
        <input aria-label="New item" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add an item" className={`${inputClass} flex-1`} />
        <Button type="submit" className="shrink-0 px-4">Add</Button>
      </form>
      {error && (
        <div className="mt-3">
          <Notice tone="warn">
            {error.text}{' '}
            {error.restore && (
              <button className="font-semibold underline" onClick={() => { edit('pick_lists', String(error.restore!.id), { archived_at: null, sort_order: Number(live.at(-1)?.sort_order ?? 0) + 10 }); setError(null); setValue('') }}>
                Restore it
              </button>
            )}
          </Notice>
        </div>
      )}
      <div className="mt-4">
        {items && live.length === 0 && <Empty>Nothing in this list yet.</Empty>}
        {live.length > 0 && (
          <Card>
            {live.map((item, i) => (
              <EditableItem key={String(item.id)} item={item}
                taken={(v) => { const s = same(v); return !!s && s.id !== item.id }}
                onRename={(v) => edit('pick_lists', String(item.id), { value: v })}
                onArchive={() => edit('pick_lists', String(item.id), { archived_at: nowIso() })}
                onUp={i > 0 ? () => move(item, -1) : undefined}
                onDown={i < live.length - 1 ? () => move(item, 1) : undefined} />
            ))}
          </Card>
        )}
      </div>
      {archived.length > 0 && (
        <Section title="Archived" aside={<button onClick={() => setShowArchived(!showArchived)} className="text-sm font-medium text-muted underline">{showArchived ? 'Hide' : `Show (${archived.length})`}</button>}>
          {showArchived && (
            <Card>
              {archived.map((item) => (
                <ListRow key={String(item.id)} label={String(item.value)} muted
                  value={<button className="font-semibold text-green" onClick={() => edit('pick_lists', String(item.id), { archived_at: null, sort_order: Number(live.at(-1)?.sort_order ?? 0) + 10 })}>Restore</button>} />
              ))}
            </Card>
          )}
        </Section>
      )}
    </Page>
  )
}

// A list item that can be renamed in place, moved, or archived.
function EditableItem({ item, taken, onRename, onArchive, onUp, onDown, label }: {
  item: Row
  taken: (v: string) => boolean
  onRename: (v: string) => void
  onArchive: () => void
  onUp?: () => void
  onDown?: () => void
  label?: string
}) {
  const text = label ?? String(item.value)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(text)
  const [error, setError] = useState<string | null>(null)

  function save(e: FormEvent) {
    e.preventDefault()
    const v = clean(value)
    if (!v) return setError("It can't be blank.")
    if (taken(v)) return setError(`${v} is already in the list.`)
    if (v !== text) onRename(v)
    setEditing(false)
    setError(null)
  }

  if (editing) {
    return (
      <form onSubmit={save} className="flex flex-col gap-2 px-4 py-3">
        <input autoFocus aria-label="Item name" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
        {error && <Notice tone="alert">{error}</Notice>}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">Save</Button>
          <Button kind="secondary" onClick={() => { setEditing(false); setValue(text); setError(null) }}>Cancel</Button>
          <Button kind="danger" onClick={onArchive}>Archive</Button>
        </div>
      </form>
    )
  }
  return (
    <div className="flex min-h-14 items-center gap-1 pr-2 pl-4">
      <button onClick={() => setEditing(true)} className="min-w-0 flex-1 truncate py-3 text-left">{text}</button>
      {(onUp || onDown) && (
        <>
          <button aria-label={`Move ${text} up`} disabled={!onUp} onClick={onUp} className="size-10 rounded-full text-muted disabled:opacity-20">↑</button>
          <button aria-label={`Move ${text} down`} disabled={!onDown} onClick={onDown} className="size-10 rounded-full text-muted disabled:opacity-20">↓</button>
        </>
      )}
    </div>
  )
}

// ---- Livestock classes ----------------------------------------------------

const SPECIES = [
  { value: 'cattle', label: 'Cattle' },
  { value: 'sheep', label: 'Sheep' },
  { value: 'goat', label: 'Goats' },
  { value: 'other', label: 'Other' },
] as const
type Species = (typeof SPECIES)[number]['value']

const SEXES = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'castrate', label: 'Castrate' },
  { value: 'mixed', label: 'Mixed' },
] as const
type Sex = (typeof SEXES)[number]['value']

export function ClassesScreen() {
  const classes = useTable('livestock_classes')
  const { add, edit } = useSync()
  const [species, setSpecies] = useState<Species>('cattle')
  const [name, setName] = useState('')
  const [sex, setSex] = useState<Sex>('female')
  const [error, setError] = useState<{ text: string; restore?: Row } | null>(null)
  const all = (classes ?? []).filter((c) => c.species === species).sort(ordered)
  const live = all.filter((c) => !c.archived_at)
  const archived = all.filter((c) => c.archived_at)
  const same = (v: string) => all.find((c) => String(c.name).toLowerCase() === v.toLowerCase())

  async function addClass(e: FormEvent) {
    e.preventDefault()
    const n = clean(name)
    if (!n) return
    const existing = same(n)
    if (existing) {
      return setError(existing.archived_at ? { text: `${existing.name} is archived.`, restore: existing } : { text: `${existing.name} is already a class.` })
    }
    setError(null)
    await add('livestock_classes', { species, name: n, sex, sort_order: Number(live.at(-1)?.sort_order ?? 0) + 10 })
    setName('')
  }

  return (
    <Page title="Livestock classes" kicker="Setup" back="/setup/lists">
      <p className="mt-3 text-muted">The classes stock are counted in, e.g. yellow tag heifers are a mob of Heifers.</p>
      <div className="mt-6"><Choice value={species} onChange={(v) => { setSpecies(v); setError(null) }} options={[...SPECIES]} /></div>
      <form onSubmit={addClass} className="mt-4 flex flex-col gap-2 rounded-2xl border border-line bg-card p-3">
        <input aria-label="New class name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a class, e.g. Weaner heifers" className={inputClass} />
        <Choice value={sex} onChange={setSex} options={[...SEXES]} />
        <Button type="submit">Add class</Button>
      </form>
      {error && (
        <div className="mt-3">
          <Notice tone="warn">
            {error.text}{' '}
            {error.restore && <button className="font-semibold underline" onClick={() => { edit('livestock_classes', String(error.restore!.id), { archived_at: null }); setError(null); setName('') }}>Restore it</button>}
          </Notice>
        </div>
      )}
      <div className="mt-4">
        {classes && live.length === 0 && <Empty>No {SPECIES.find((s) => s.value === species)?.label.toLowerCase()} classes yet.</Empty>}
        {live.length > 0 && (
          <Card>
            {live.map((c) => (
              <ClassRow key={String(c.id)} row={c} taken={(v) => { const s = same(v); return !!s && s.id !== c.id }}
                onSave={(changes) => edit('livestock_classes', String(c.id), changes)}
                onArchive={() => edit('livestock_classes', String(c.id), { archived_at: nowIso() })} />
            ))}
          </Card>
        )}
      </div>
      {archived.length > 0 && (
        <Section title="Archived">
          <Card>
            {archived.map((c) => (
              <ListRow key={String(c.id)} label={String(c.name)} muted
                value={<button className="font-semibold text-green" onClick={() => edit('livestock_classes', String(c.id), { archived_at: null })}>Restore</button>} />
            ))}
          </Card>
        </Section>
      )}
    </Page>
  )
}

function ClassRow({ row, taken, onSave, onArchive }: { row: Row; taken: (v: string) => boolean; onSave: (c: Row) => void; onArchive: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(String(row.name))
  const [sex, setSex] = useState<Sex>((row.sex as Sex) ?? 'mixed')
  const [error, setError] = useState<string | null>(null)
  const sexLabel = SEXES.find((s) => s.value === row.sex)?.label

  function save(e: FormEvent) {
    e.preventDefault()
    const n = clean(name)
    if (!n) return setError("It can't be blank.")
    if (taken(n)) return setError(`${n} is already a class.`)
    onSave({ name: n, sex })
    setEditing(false)
  }

  if (!editing) return <ListRow onClick={() => setEditing(true)} label={String(row.name)} value={sexLabel ?? ''} />
  return (
    <form onSubmit={save} className="flex flex-col gap-2 px-4 py-3">
      <input autoFocus aria-label="Class name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      <Choice value={sex} onChange={setSex} options={[...SEXES]} />
      {error && <Notice tone="alert">{error}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Save</Button>
        <Button kind="secondary" onClick={() => { setEditing(false); setName(String(row.name)); setError(null) }}>Cancel</Button>
        <Button kind="danger" onClick={onArchive}>Archive</Button>
      </div>
    </form>
  )
}
