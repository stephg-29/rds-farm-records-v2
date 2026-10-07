// Rainfall (rain gauge readings) and Documents (plans, reports, reviews).
import { useRef, useState, type FormEvent } from 'react'
import type { Row } from '../lib/db'
import { attachFiles, useAttachments } from '../lib/files'
import { todayLocal } from '../lib/stock'
import { useSync, useTable } from '../lib/useSync'
import { Button, Card, Empty, Field, Notice, Page, Row as ListRow, Section, go, inputClass } from '../ui'
import { Photo } from './Issues'
import { DateField, fmtDate } from './stockParts'

const num = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() === '' || Number.isNaN(n) ? null : n }
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

// ---- Rainfall ------------------------------------------------------------------------

export function RainfallScreen() {
  const readings = (useTable('readings') ?? []).filter((r) => r.measure === 'rainfall_mm')
  const properties = useTable('properties') ?? []
  const gauges = (useTable('map_features') ?? []).filter((f) => f.feature_type === 'rain_gauge' && !f.archived_at)
  const { add, remove } = useSync()
  const [date, setDate] = useState(todayLocal())
  const [mm, setMm] = useState('')
  const [where, setWhere] = useState('')
  const [error, setError] = useState<string | null>(null)
  const place = where || (gauges[0] ? `g:${gauges[0].id}` : properties[0] ? `p:${properties[0].id}` : '')
  const year = todayLocal().slice(0, 4)
  const sorted = [...readings].sort((a, b) => String(b.observed_at).localeCompare(String(a.observed_at)))
  const byMonth = new Map<string, number>()
  for (const r of readings) {
    const m = String(r.observed_at).slice(0, 7)
    byMonth.set(m, (byMonth.get(m) ?? 0) + Number(r.value))
  }
  const ytd = [...byMonth].filter(([m]) => m.startsWith(year)).reduce((n, [, v]) => n + v, 0)

  async function save(e: FormEvent) {
    e.preventDefault()
    const v = num(mm)
    if (v === null || v < 0) return setError('How many mm?')
    setError(null)
    const gauge = place.startsWith('g:') ? gauges.find((g) => g.id === place.slice(2)) : undefined
    await add('readings', {
      source: 'manual', measure: 'rainfall_mm', value: v, observed_at: `${date}T09:00:00`,
      property_id: gauge ? gauge.property_id : place.slice(2) || null, map_feature_id: gauge ? gauge.id : null,
    })
    setMm('')
  }

  return (
    <Page title="Rainfall" kicker="Paddocks" back="/paddocks">
      <form onSubmit={save} className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
        <div className="grid grid-cols-2 gap-3">
          <DateField value={date} onChange={setDate} />
          <Field id="mm" label="Rain (mm)"><input id="mm" inputMode="decimal" value={mm} onChange={(e) => setMm(e.target.value)} className={inputClass} /></Field>
        </div>
        {(gauges.length + properties.length > 1) && (
          <Field id="where" label="Gauge" hint={gauges.length === 0 ? 'Add rain gauges on the map (Point, Rain gauge) to record each one.' : undefined}>
            <select id="where" value={place} onChange={(e) => setWhere(e.target.value)} className={inputClass}>
              {gauges.map((g) => <option key={String(g.id)} value={`g:${g.id}`}>{String(g.name ?? 'Rain gauge')}</option>)}
              {properties.map((p) => <option key={String(p.id)} value={`p:${p.id}`}>{String(p.name)} (no particular gauge)</option>)}
            </select>
          </Field>
        )}
        {error && <Notice tone="alert">{error}</Notice>}
        <Button type="submit">Add reading</Button>
      </form>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-card p-4"><div className="font-display text-3xl">{Math.round(ytd * 10) / 10}</div><div className="text-sm text-muted">mm this year</div></div>
        <div className="rounded-2xl border border-line bg-card p-4"><div className="font-display text-3xl">{Math.round((byMonth.get(todayLocal().slice(0, 7)) ?? 0) * 10) / 10}</div><div className="text-sm text-muted">mm this month</div></div>
      </div>
      <Section title="By month">
        {byMonth.size === 0 ? <Empty>No readings yet.</Empty> : (
          <Card>{[...byMonth].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 24).map(([m, v]) => (
            <ListRow key={m} label={new Date(`${m}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })} value={`${Math.round(v * 10) / 10} mm`} />
          ))}</Card>
        )}
      </Section>
      {sorted.length > 0 && (
        <Section title="Readings">
          <Card>{sorted.slice(0, 30).map((r) => (
            <ListRow key={String(r.id)} label={`${String(r.value)} mm`} detail={`${fmtDate(String(r.observed_at).slice(0, 10))}${r.map_feature_id ? ` · ${String(gauges.find((g) => g.id === r.map_feature_id)?.name ?? 'gauge')}` : ''}`}
              value={<button className="text-sm text-alert underline" onClick={() => remove('readings', String(r.id))}>Delete</button>} />
          ))}</Card>
        </Section>
      )}
    </Page>
  )
}

// ---- Documents ---------------------------------------------------------------------------

export const DOC_KINDS = [
  { value: 'biosecurity_plan', label: 'Biosecurity plan' },
  { value: 'property_risk_assessment', label: 'Property risk assessment' },
  { value: 'welfare_plan', label: 'Animal welfare plan' },
  { value: 'soil_test', label: 'Soil test' },
  { value: 'agronomist_report', label: 'Agronomist report' },
  { value: 'feed_test', label: 'Feed test' },
  { value: 'other', label: 'Other' },
]

export function DocumentList() {
  const docs = useTable('documents')
  const today = todayLocal()
  const list = [...(docs ?? [])].sort((a, b) => String(a.title).localeCompare(String(b.title)))
  return (
    <Page title="Documents" kicker="More" back="/more" action={<Button className="shrink-0" onClick={() => go('/records/documents/new')}>Add</Button>}>
      <p className="mt-3 text-muted">Plans and reports, with review dates. The LPA asks for a biosecurity plan and property risk assessment.</p>
      <div className="mt-5">
        {docs && list.length === 0 && <Empty>No documents yet.</Empty>}
        {list.length > 0 && (
          <Card>{list.map((d) => (
            <ListRow key={String(d.id)} onClick={() => go(`/records/documents/${d.id}`)} label={String(d.title)}
              detail={<>{DOC_KINDS.find((k) => k.value === d.document_kind)?.label}{d.review_due && <span className={String(d.review_due) <= today ? 'text-alert' : ''}> · review {fmtDate(String(d.review_due), { day: 'numeric', month: 'short', year: 'numeric' })}</span>}</>} />
          ))}</Card>
        )}
      </div>
    </Page>
  )
}

export function DocumentScreen({ id }: { id?: string }) {
  const docs = useTable('documents')
  if (!docs) return null
  const d = id ? docs.find((x) => x.id === id) : undefined
  if (id && !d) return <Page title="Not found" back="/records/documents"><p className="mt-4 text-muted">That document isn't on this phone.</p></Page>
  return <DocumentForm key={id ?? 'new'} d={d} />
}

function DocumentForm({ d }: { d?: Row }) {
  const { saveAll, remove, ctx } = useSync()
  const attachments = useAttachments('documents', d ? String(d.id) : undefined)
  const [title, setTitle] = useState(str(d?.title))
  const [kind, setKind] = useState(str(d?.document_kind) || 'biosecurity_plan')
  const [date, setDate] = useState(str(d?.document_date) || todayLocal())
  const [review, setReview] = useState(str(d?.review_due))
  const [notes, setNotes] = useState(str(d?.notes))
  const [files, setFiles] = useState<File[]>([])
  const [confirm, setConfirm] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const id = d ? String(d.id) : crypto.randomUUID()
    const values = { title: title.trim(), document_kind: kind, document_date: date || null, review_due: review || null, notes: notes.trim() || null }
    const fileRecords = await attachFiles(ctx.db, 'documents', id, files)
    await saveAll([...(d ? [] : [{ table: 'documents', values: { id, ...values } }]), ...fileRecords], d ? [{ table: 'documents', id, changes: values }] : [])
    go('/records/documents')
  }
  return (
    <Page title={d ? str(d.title) : 'New document'} kicker="Documents" back="/records/documents">
      <form onSubmit={save} className="mt-5 flex flex-col gap-4">
        <Field id="title" label="Title"><input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Farm biosecurity plan 2026" /></Field>
        <Field id="kind" label="Kind"><select id="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>{DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <DateField value={date} onChange={setDate} />
          <Field id="review" label="Review by"><input id="review" type="date" value={review} onChange={(e) => setReview(e.target.value)} className={inputClass} /></Field>
        </div>
        <Field id="notes" label="Notes"><textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} h-auto py-3`} /></Field>
        {attachments.length > 0 && <div className="grid grid-cols-3 gap-2">{attachments.map((a) => <Photo key={String(a.id)} a={a} />)}</div>}
        <input ref={input} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
        <Button kind="secondary" onClick={() => input.current?.click()}>Attach the document (PDF or photo){files.length ? ` · ${files.length} to add` : ''}</Button>
        <Button type="submit">Save</Button>
      </form>
      {d && (
        <div className="mt-8">
          {confirm ? (
            <div className="flex gap-2"><Button kind="danger" className="flex-1" onClick={async () => { await remove('documents', String(d.id)); go('/records/documents') }}>Yes, delete it</Button><Button kind="secondary" onClick={() => setConfirm(false)}>Keep</Button></div>
          ) : <Button kind="danger" className="w-full" onClick={() => setConfirm(true)}>Delete this document</Button>}
        </div>
      )}
    </Page>
  )
}
