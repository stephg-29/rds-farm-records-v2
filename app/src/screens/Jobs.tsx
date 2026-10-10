// Contractor jobs. Owners set up a job (contractor, paddocks, dates,
// instructions); the contractor sees only their open jobs, with the job
// paddocks picked out on the map. Stock in a job paddock is flagged.
import { useMemo, useState, type FormEvent } from 'react'
import type { Row } from '../lib/db'
import { loadLayers } from '../lib/mapStyle'
import { todayLocal } from '../lib/stock'
import { jobProgress, type JobPaddockStatus } from '../lib/land'
import { groupOf } from '../lib/joins'
import { useFarm } from '../lib/useFarm'
import { useStock } from '../lib/useStock'
import { useOffline, useSync, useTable, useView } from '../lib/useSync'
import { Button, Card, Choice, Empty, Field, Notice, Page, Row as ListRow, Section, WarnPopup, go, inputClass, nowIso } from '../ui'
import { DateField, fmtDate } from './stockParts'
import { MapView } from './map/MapView'

export const JOB_TYPES = [
  { value: 'spray', label: 'Spraying' },
  { value: 'fertiliser', label: 'Fertiliser' },
  { value: 'sowing', label: 'Sowing' },
  { value: 'other', label: 'Other' },
] as const

function useJobs() {
  const jobs = useTable('jobs')
  const links = useTable('job_paddocks')
  return {
    ready: jobs !== undefined && links !== undefined,
    jobs: jobs ?? [],
    paddocksOf: (jobId: string) => (links ?? []).filter((l) => l.job_id === jobId).map((l) => String(l.paddock_id)),
    links: links ?? [],
  }
}

// Mobs in the given paddocks right now.
function stockIn(stock: ReturnType<typeof useStock>, paddockIds: string[], joins: Row[] = []) {
  const reach = new Set(paddockIds.flatMap((p) => groupOf(joins, p)))
  return stock.mobs.filter((m) => m.head > 0 && m.location?.paddockId && reach.has(m.location.paddockId))
}

// ---- Owner: list ----------------------------------------------------------------

export function JobList() {
  const { jobs, ready } = useJobs()
  const profiles = useTable('profiles') ?? []
  const { isOwner } = useFarm()
  const [show, setShow] = useState<'open' | 'closed'>('open')
  const list = jobs.filter((j) => j.status === show).sort((a, b) => String(b.start_date ?? '').localeCompare(String(a.start_date ?? '')))
  return (
    <Page title="Contractor jobs" kicker="More" back="/more" action={isOwner ? <Button className="shrink-0" onClick={() => go('/jobs/new')}>New job</Button> : undefined}>
      <div className="mt-4"><Choice value={show} onChange={setShow} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} /></div>
      <div className="mt-4">
        {ready && list.length === 0 && <Empty>{show === 'open' ? 'No open jobs.' : 'No closed jobs.'}</Empty>}
        {list.length > 0 && (
          <Card>
            {list.map((j) => (
              <ListRow key={String(j.id)} onClick={() => go(`/jobs/${j.id}`)}
                label={`${JOB_TYPES.find((t) => t.value === j.job_type)?.label}: ${String(profiles.find((p) => p.user_id === j.contractor_user_id)?.full_name ?? 'Contractor')}`}
                detail={[j.start_date ? fmtDate(String(j.start_date)) : null, j.end_date ? `to ${fmtDate(String(j.end_date))}` : null, j.instructions].filter(Boolean).join(' · ')} />
            ))}
          </Card>
        )}
      </div>
    </Page>
  )
}

// ---- Owner: new or edit -------------------------------------------------------------

export function JobFormScreen({ id }: { id?: string }) {
  const { jobs, ready, paddocksOf } = useJobs()
  const { isOwner } = useFarm()
  if (!ready) return null
  if (!isOwner) return <Page title="Contractor jobs" back="/jobs"><p className="mt-4 text-muted">Only an owner can set up jobs.</p></Page>
  const job = id ? jobs.find((j) => j.id === id) : undefined
  return <JobForm key={id ?? 'new'} job={job} chosen={job ? paddocksOf(String(job.id)) : []} />
}

function JobForm({ job, chosen }: { job?: Row; chosen: string[] }) {
  const stock = useStock()
  const profiles = (useTable('profiles') ?? []).filter((p) => p.role === 'contractor' && p.active)
  const links = useTable('job_paddocks') ?? []
  const gateJoins = useTable('paddock_joins') ?? []
  const { saveAll } = useSync()
  const [type, setType] = useState(String(job?.job_type ?? 'spray'))
  const [contractorPick, setContractor] = useState(String(job?.contractor_user_id ?? ''))
  const [propertyPick, setPropertyId] = useState(String(job?.property_id ?? ''))
  // Until something is picked, the first contractor and property (once loaded).
  const contractor = contractorPick || String(profiles[0]?.user_id ?? '')
  const propertyId = propertyPick || String(stock.properties[0]?.id ?? '')
  const [paddocks, setPaddocks] = useState<string[]>(chosen)
  const [start, setStart] = useState(String(job?.start_date ?? todayLocal()))
  const [end, setEnd] = useState(String(job?.end_date ?? ''))
  const [instructions, setInstructions] = useState(String(job?.instructions ?? ''))
  const [error, setError] = useState<string | null>(null)
  const options = stock.paddocks.filter((d) => d.property_id === propertyId).sort((a, b) => String(a.name).localeCompare(String(b.name), 'en-AU', { numeric: true }))
  const occupied = stockIn(stock, paddocks, gateJoins)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!contractor) return setError('Add the contractor in More, People first (role Contractor).')
    if (paddocks.length === 0) return setError('Tick the paddocks in the job.')
    const id = job ? String(job.id) : crypto.randomUUID()
    const values = { job_type: type, contractor_user_id: contractor, property_id: propertyId, start_date: start || null, end_date: end || null, instructions: instructions.trim() || null }
    const keep = links.filter((l) => l.job_id === id)
    await saveAll(
      [
        ...(job ? [] : [{ table: 'jobs', values: { id, ...values, status: 'open' } }]),
        ...paddocks.filter((p) => !keep.some((l) => l.paddock_id === p)).map((p) => ({ table: 'job_paddocks', values: { job_id: id, paddock_id: p } })),
      ],
      [
        ...(job ? [{ table: 'jobs', id, changes: values }] : []),
        ...keep.filter((l) => !paddocks.includes(String(l.paddock_id))).map((l) => ({ table: 'job_paddocks', id: String(l.id), changes: { deleted_at: nowIso() } })),
      ],
    )
    go(`/jobs/${id}`)
  }

  return (
    <Page title={job ? 'Edit job' : 'New job'} kicker="Contractor jobs" back={job ? `/jobs/${job.id}` : '/jobs'}>
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <Field id="type" label="Job"><Choice value={type} onChange={setType} options={[...JOB_TYPES]} /></Field>
        <Field id="who" label="Contractor" hint={profiles.length === 0 ? 'Add them first in More, People, with the Contractor role.' : 'They see only this job while it is open.'}>
          <select id="who" value={contractor} onChange={(e) => setContractor(e.target.value)} className={inputClass}>
            {profiles.map((p) => <option key={String(p.user_id)} value={String(p.user_id)}>{String(p.full_name)}</option>)}
          </select>
        </Field>
        {stock.properties.length > 1 && (
          <Field id="prop" label="Property">
            <select id="prop" value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setPaddocks([]) }} className={inputClass}>
              {stock.properties.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}
            </select>
          </Field>
        )}
        <div>
          <div className="mb-2 text-sm font-semibold text-muted">Paddocks</div>
          <Card>
            {options.map((d) => {
              const on = paddocks.includes(String(d.id))
              const mobs = stockIn(stock, [String(d.id)], gateJoins)
              return (
                <label key={String(d.id)} className="flex min-h-12 items-center gap-3 px-4 py-2">
                  <input type="checkbox" checked={on} onChange={() => setPaddocks(on ? paddocks.filter((x) => x !== d.id) : [...paddocks, String(d.id)])} className="size-5 accent-green" />
                  <span className="flex-1">{String(d.name)}</span>
                  {mobs.length > 0 && <span className="text-xs font-semibold text-alert">stock in</span>}
                </label>
              )
            })}
          </Card>
        </div>
        {occupied.length > 0 && (
          <Notice tone="alert">Stock are in job paddocks: {occupied.map((m) => `${m.name} (${m.head}) in ${m.location ? stock.paddockName(m.location.paddockId, m.location.propertyId) : '?'}`).join(', ')}. Move them before the job if they shouldn't be there.</Notice>
        )}
        <div className="grid grid-cols-2 gap-3">
          <DateField value={start} onChange={setStart} />
          <Field id="end" label="Finish by"><input id="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} /></Field>
        </div>
        <Field id="instr" label="Instructions"><textarea id="instr" rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} className={`${inputClass} h-auto py-3`} placeholder="e.g. Boom spray thistles, avoid the creek line, gate code 1234" /></Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button type="submit">{job ? 'Save changes' : 'Create job'}</Button>
      </form>
    </Page>
  )
}

// ---- One job (owner and contractor) ------------------------------------------------------

export function JobScreen({ id }: { id: string }) {
  const { jobs, ready, paddocksOf } = useJobs()
  const { isOwner, me } = useFarm()
  const { edit } = useSync()
  const stock = useStock()
  const profiles = useTable('profiles') ?? []
  const allPaddocks = useTable('paddocks') ?? []
  // Fences, gates and water, so a contractor can find the way in.
  const features = (useTable('map_features') ?? []).filter((f) => !f.archived_at)
  const withStock = useView('paddocks_with_stock') ?? []
  const sprays = useTable('spray_records') ?? []
  const sprayLinks = useTable('spray_record_paddocks') ?? []
  const pastures = useTable('pasture_records') ?? []
  const pastureLinks = useTable('pasture_record_paddocks') ?? []
  const offline = useOffline()
  const joins = useTable('paddock_joins') ?? []
  const job = jobs.find((j) => j.id === id)
  const pids = useMemo(() => (job ? paddocksOf(String(job.id)) : []), [job, paddocksOf])
  const highlight = useMemo(() => new Set(pids), [pids])
  const contractorView = me?.role === 'contractor'
  if (!ready) return null
  if (!job) return <Page title="Not found" back={contractorView ? '/' : '/jobs'}><p className="mt-4 text-muted">That job isn't open, or isn't on this phone.</p></Page>
  const property = stock.properties.find((p) => p.id === job.property_id) ?? { id: job.property_id, name: '' }
  const occupied = contractorView ? [] : stockIn(stock, pids, joins)
  // Contractors see only that livestock is recorded in a paddock, not what.
  const flagged = contractorView ? new Set(withStock.map((x) => String(x.paddock_id))) : undefined
  const flaggedJob = contractorView ? pids.filter((p) => flagged!.has(p)) : []
  const label = JOB_TYPES.find((t) => t.value === job.job_type)?.label
  const layers = { ...loadLayers(), paddocks: true, fences: true, electric: true, water: true, issues: false, stock: !contractorView, location: true }

  const progress = jobProgress(String(job.id), pids, { sprays, sprayLinks, pastures, pastureLinks })
  const colours = new Map(pids.map((p) => [p, STATUS_COLOUR[progress.get(p)?.status ?? 'todo']]))
  const stockNames = flaggedJob.map((p) => String(allPaddocks.find((x) => x.id === p)?.name ?? 'a job paddock')).join(', ')

  return (
    <Page title={`${label} job`} kicker={String(property.name ?? '')} back={contractorView ? '/' : '/jobs'}
      action={isOwner ? <Button kind="secondary" className="shrink-0 px-4" onClick={() => go(`/jobs/${id}/edit`)}>Edit</Button> : undefined}>
      <p className="mt-2 text-muted">
        {[contractorView ? null : String(profiles.find((p) => p.user_id === job.contractor_user_id)?.full_name ?? ''),
          job.start_date ? `from ${fmtDate(String(job.start_date))}` : null, job.end_date ? `finish by ${fmtDate(String(job.end_date))}` : null,
          job.status === 'closed' ? 'Closed' : null].filter(Boolean).join(' · ')}
      </p>
      <WarnPopup show={flaggedJob.length > 0} warnKey={flaggedJob.join()} title="Livestock in a job paddock">
        There's livestock recorded in <b>{stockNames}</b>. Check the paddock before spraying or spreading, and contact the owner if stock are there.
      </WarnPopup>
      <WarnPopup show={occupied.length > 0} warnKey={occupied.map((m) => m.id).join()} title="Stock in job paddocks">
        {occupied.map((m) => `${m.name} (${m.head})`).join(', ')} {occupied.length === 1 ? 'is' : 'are'} in this job's paddocks. Move them out, or tell the contractor.
      </WarnPopup>
      {occupied.length > 0 && <div className="mt-4"><Notice tone="alert">Stock in job paddocks: {occupied.map((m) => `${m.name} (${m.head})`).join(', ')}.</Notice></div>}
      {flaggedJob.length > 0 && <div className="mt-4"><Notice tone="alert"><b>Livestock recorded in {stockNames}.</b> Check before spraying.</Notice></div>}

      <Section title="Paddocks">
        <Card>{pids.map((p) => {
          const d = allPaddocks.find((x) => x.id === p)
          const pr = progress.get(p)
          return (
            <div key={p} className="flex min-h-14 items-center gap-3 px-4 py-3">
              <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: STATUS_COLOUR[pr?.status ?? 'todo'] }} />
              <span className="min-w-0 flex-1">
                <span className="block">{String(d?.name ?? 'Paddock')}</span>
                {pr?.status === 'part' && <span className="block text-xs text-muted">Part done{pr.areaDone ? `: ${pr.areaDone} ha` : ''}{pr.reasons.length ? ` (${pr.reasons.join(', ')})` : ''}</span>}
              </span>
              <span className="shrink-0 text-sm text-muted">{d?.area_ha ? `${d.area_ha} ha · ` : ''}{pr?.status === 'done' ? 'Done' : pr?.status === 'part' ? 'Part' : 'To do'}</span>
            </div>
          )
        })}</Card>
      </Section>
      {!!job.instructions && <Section title="Instructions"><p className="whitespace-pre-wrap rounded-2xl border border-line bg-card px-4 py-3">{String(job.instructions)}</p></Section>}
      {job.status === 'open' && (contractorView || isOwner) && (
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button onClick={() => go(`/records/spray/new?job=${id}`)}>Record spraying</Button>
          <Button kind="secondary" onClick={() => go(`/records/pasture/new?job=${id}`)}>Record fertiliser or sowing</Button>
        </div>
      )}
      <JobRecords jobId={id} />

      <Section title="Map">
        <div className="-mt-1 mb-2 flex flex-wrap gap-3 text-xs text-muted">
          {(['todo', 'part', 'done'] as const).map((k) => <span key={k} className="flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: STATUS_COLOUR[k] }} />{k === 'todo' ? 'To do' : k === 'part' ? 'Part done' : 'Done'}</span>)}
          <span>· fences, gates and water to get there</span>
        </div>
        <div className="h-[65vh] min-h-96 overflow-hidden rounded-2xl border border-line">
          <MapView property={property as Row} paddocks={allPaddocks} features={features} issues={[]} gps={null} layers={layers} highlight={highlight} highlightColours={colours} fitTo={pids} stockFlags={flagged} offline={offline}
            mobs={contractorView ? [] : stock.mobs.map((m) => ({ id: m.id, name: m.name, head: m.head, propertyId: m.location?.propertyId ?? '', paddockId: m.location?.paddockId ?? null, underWithhold: false }))} />
        </div>
      </Section>
      {isOwner && (
        <div className="mt-8">
          {job.status === 'open'
            ? <Button kind="secondary" className="w-full" onClick={() => edit('jobs', id, { status: 'closed' })}>Close the job (the contractor loses access)</Button>
            : <Button kind="secondary" className="w-full" onClick={() => edit('jobs', id, { status: 'open' })}>Reopen the job</Button>}
        </div>
      )}
    </Page>
  )
}

// To do (yellow), part done (orange), done (green), on the job's map and list.
const STATUS_COLOUR: Record<JobPaddockStatus, string> = { todo: '#f2e14c', part: '#f08c2e', done: '#5cc46e' }

// ---- Contractor: their jobs --------------------------------------------------------------

export function ContractorHome() {
  const { jobs, ready } = useJobs()
  const { me } = useFarm()
  const open = jobs.filter((j) => j.status === 'open')
  return (
    <Page title="Your jobs" kicker={me ? String(me.full_name) : undefined}>
      <div className="mt-5">
        {ready && open.length === 0 && <Empty>No open jobs at the moment. The farm owner will add one when there's work.</Empty>}
        {open.length > 0 && (
          <Card>
            {open.map((j) => (
              <ListRow key={String(j.id)} onClick={() => go(`/jobs/${j.id}`)}
                label={`${JOB_TYPES.find((t) => t.value === j.job_type)?.label} job`}
                detail={[j.start_date ? `from ${fmtDate(String(j.start_date))}` : null, j.end_date ? `finish by ${fmtDate(String(j.end_date))}` : null].filter(Boolean).join(' · ')} />
            ))}
          </Card>
        )}
      </div>
    </Page>
  )
}

// Spray and pasture records made under a job.
function JobRecords({ jobId }: { jobId: string }) {
  const sprays = (useTable('spray_records') ?? []).filter((s) => s.job_id === jobId)
  const pastures = (useTable('pasture_records') ?? []).filter((p) => p.job_id === jobId)
  const list = [
    ...sprays.map((s) => ({ id: String(s.id), date: String(s.spray_date), text: `Spraying${s.target ? `: ${s.target}` : ''}`, path: `/records/spray/${s.id}` })),
    ...pastures.map((p) => ({ id: String(p.id), date: String(p.record_date), text: p.record_type === 'fertiliser' ? 'Fertiliser' : 'Pasture improvement', path: `/records/pasture/${p.id}` })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  if (list.length === 0) return null
  return (
    <Section title="Recorded for this job">
      <Card>{list.map((r) => <ListRow key={r.id} onClick={() => go(r.path)} label={r.text} detail={fmtDate(r.date)} />)}</Card>
    </Section>
  )
}
