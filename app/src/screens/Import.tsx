// Import a client's existing records (owners): Farm Records v1 sheets (CSV)
// and Fence Map data.js. Preview first; every import can be undone.
import { useRef, useState } from 'react'
import type { Row } from '../lib/db'
import { areaHa } from '../lib/geo'
import { V1_LABEL, importFenceMap, importV1, parseCsv, parseFenceMapData, type Created, type Existing, type ImportResult } from '../lib/importers'
import { useFarm } from '../lib/useFarm'
import { useSync, useTable } from '../lib/useSync'
import { Button, Card, Choice, Empty, Field, Notice, Page, Row as ListRow, Section, inputClass, nowIso } from '../ui'

type Prepared = { fileName: string; label: string; result: ImportResult; rowsRead: number; source: string }

function useExisting(): Existing {
  return {
    properties: useTable('properties') ?? [], paddocks: useTable('paddocks') ?? [], mobs: useTable('mobs') ?? [],
    products: useTable('products') ?? [], contacts: useTable('contacts') ?? [], vehicles: useTable('vehicles') ?? [], batches: useTable('product_batches') ?? [],
  }
}

export function ImportScreen() {
  const { isOwner } = useFarm()
  const { saveAll } = useSync()
  const existing = useExisting()
  const batches = useTable('import_batches') ?? []
  const [source, setSource] = useState<'v1' | 'fencemap'>('v1')
  const [prepared, setPrepared] = useState<Prepared[]>([])
  const [fm, setFm] = useState<{ fileName: string; props: ReturnType<typeof parseFenceMapData> } | null>(null)
  const [fmProp, setFmProp] = useState(0)
  const [toProp, setToProp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  if (!isOwner) return <Page title="Import records" back="/more"><p className="mt-4 text-muted">Only an owner can import records.</p></Page>
  const targetProp = toProp || String(existing.properties[0]?.id ?? '')

  async function read(files: FileList | null) {
    setError(null); setDone(null); setPrepared([]); setFm(null)
    if (!files?.length) return
    try {
      if (source === 'fencemap') {
        const f = files[0]
        setFm({ fileName: f.name, props: parseFenceMapData(await f.text()) })
        return
      }
      const out: Prepared[] = []
      for (const f of Array.from(files)) {
        const rows = parseCsv(await f.text())
        const result = importV1(rows, existing, { owner: isOwner })
        out.push({ fileName: f.name, label: result.area ? V1_LABEL[result.area] : 'Not recognised', result, rowsRead: Math.max(0, rows.length - 1), source: `farm_records_v1:${result.area ?? 'unknown'}` })
      }
      setPrepared(out)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const fmResult = fm && fm.props[fmProp] && targetProp
    ? { fileName: fm.fileName, label: `Fence Map: ${fm.props[fmProp].name}`, rowsRead: (fm.props[fmProp].features?.length ?? 0) + (fm.props[fmProp].units?.length ?? 0), source: 'fence_map',
        result: importFenceMap(fm.props[fmProp], targetProp, existing, (c) => areaHa({ type: 'Polygon', coordinates: c })) }
    : null
  const toImport = (source === 'fencemap' ? (fmResult ? [fmResult] : []) : prepared).filter((p) => p.result.imported > 0)

  async function run() {
    for (const p of toImport) {
      await saveAll([
        ...p.result.adds,
        { table: 'import_batches', values: {
          source: p.source, file_name: p.fileName, rows_read: p.rowsRead, rows_imported: p.result.imported, rows_rejected: p.result.skipped.length,
          created_records: p.result.created, notes: p.result.notes.join(' ') || null,
        } },
      ], p.result.edits)
    }
    setDone(`Imported ${toImport.reduce((n, p) => n + p.result.imported, 0)} records. They're syncing now.`)
    setPrepared([]); setFm(null)
  }

  return (
    <Page title="Import records" kicker="More" back="/more">
      <p className="mt-3 text-muted">Bring in records from Farm Records v1 or the Fence Map. You see what will come in before anything is saved, and an import can be undone.</p>
      <div className="mt-5"><Choice value={source} onChange={(v) => { setSource(v); setPrepared([]); setFm(null) }} options={[{ value: 'v1', label: 'Farm Records v1' }, { value: 'fencemap', label: 'Fence Map' }]} /></div>
      <p className="mt-3 text-sm text-muted">
        {source === 'v1'
          ? 'In the Google Sheet, open each tab (Mob Treatments, Stock Movements, Spray Records, Pasture & Fertiliser, Vehicle Maintenance) and use File, Download, Comma-separated values. Or use the v1 app\'s own download. Pick one or more of those files.'
          : 'Pick the Fence Map\'s data.js (from the site, or Export data.js in edit mode).'}
      </p>
      <input ref={input} type="file" multiple={source === 'v1'} accept={source === 'v1' ? '.csv,text/csv' : '.js,text/javascript'} hidden onChange={(e) => { read(e.target.files); e.target.value = '' }} />
      <Button className="mt-4 w-full" onClick={() => input.current?.click()}>Choose {source === 'v1' ? 'CSV files' : 'data.js'}</Button>
      {error && <div className="mt-4"><Notice tone="alert">{error}</Notice></div>}
      {done && <div className="mt-4"><Notice tone="ok">{done}</Notice></div>}

      {fm && (
        <div className="mt-5 flex flex-col gap-3">
          {fm.props.length > 1 && (
            <Field id="fmprop" label="Fence Map property">
              <select id="fmprop" value={fmProp} onChange={(e) => setFmProp(Number(e.target.value))} className={inputClass}>{fm.props.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}</select>
            </Field>
          )}
          <Field id="toprop" label="Into this property">
            <select id="toprop" value={targetProp} onChange={(e) => setToProp(e.target.value)} className={inputClass}>{existing.properties.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}</select>
          </Field>
        </div>
      )}

      {(source === 'v1' ? prepared : fmResult ? [fmResult] : []).map((p) => (
        <Section key={p.fileName + p.label} title={p.label}>
          <p className="-mt-2 mb-2 text-sm text-muted">{p.fileName} · {p.rowsRead} rows</p>
          <Card>
            <ListRow label="Will come in" value={String(p.result.imported)} />
            {summarise(p.result).map(([what, n]) => <ListRow key={what} label={`  ${what}`} value={String(n)} muted />)}
            {p.result.edits.length > 0 && <ListRow label="Existing records updated" detail="Boundaries on paddocks that had none; the property's map view" value={String(p.result.edits.length)} />}
            {p.result.skipped.length > 0 && <ListRow label="Skipped" detail={p.result.skipped.slice(0, 5).map((s) => `row ${s.row}: ${s.why}`).join(' · ')} value={String(p.result.skipped.length)} />}
          </Card>
          {p.result.notes.map((n) => <div key={n} className="mt-2"><Notice tone="info">{n}</Notice></div>)}
        </Section>
      ))}
      {toImport.length > 0 && <Button className="mt-6 w-full" onClick={run}>Import {toImport.reduce((n, p) => n + p.result.imported, 0)} records</Button>}

      <ImportHistory batches={batches} />
    </Page>
  )
}

const NAMES: Record<string, string> = {
  treatments: 'Treatments', stock_events: 'Movements', spray_records: 'Spray records', pasture_records: 'Pasture records', vehicle_services: 'Vehicle services',
  products: 'New products', contacts: 'New contacts', vehicles: 'New vehicles', map_features: 'Map features', paddocks: 'New paddocks', product_batches: 'Batches',
}
function summarise(r: ImportResult): [string, number][] {
  const counts = new Map<string, number>()
  for (const a of r.adds) if (NAMES[a.table]) counts.set(NAMES[a.table], (counts.get(NAMES[a.table]) ?? 0) + 1)
  return [...counts]
}

function ImportHistory({ batches }: { batches: Row[] }) {
  const { saveAll } = useSync()
  const [confirm, setConfirm] = useState<string | null>(null)
  const list = [...batches].sort((a, b) => String(b.created_at ?? b.recorded_at).localeCompare(String(a.created_at ?? a.recorded_at)))
  async function undo(b: Row) {
    const created = (b.created_records as Created[]) ?? []
    const now = nowIso()
    await saveAll([], [
      ...created.map((c) => ({ table: c.table, id: c.id, changes: c.cleared === 'boundary' ? { boundary: null } : c.cleared === 'start_view' ? { centre_lat: null, centre_lng: null, default_zoom: null } : { deleted_at: now }, reason: 'Import undone' })),
      { table: 'import_batches', id: String(b.id), changes: { undone_at: now } },
    ])
    setConfirm(null)
  }
  return (
    <Section title="Imports">
      {list.length === 0 ? <Empty>Nothing imported yet.</Empty> : (
        <Card>
          {list.map((b) => (
            <div key={String(b.id)} className="px-4 py-3">
              <div className="font-medium">{String(b.file_name ?? b.source)}</div>
              <div className="text-sm text-muted">{String(b.rows_imported ?? 0)} imported{b.rows_rejected ? `, ${b.rows_rejected} skipped` : ''}{b.undone_at ? ' · undone' : ''}</div>
              {!b.undone_at && (confirm === b.id
                ? <div className="mt-2 flex gap-2"><Button kind="danger" className="flex-1" onClick={() => undo(b)}>Yes, undo it</Button><Button kind="secondary" onClick={() => setConfirm(null)}>Keep</Button></div>
                : <button className="mt-1 text-sm font-semibold text-alert underline" onClick={() => setConfirm(String(b.id))}>Undo this import</button>)}
            </div>
          ))}
        </Card>
      )}
    </Section>
  )
}
