// An alert raised by the database (e.g. a sale recorded inside a withhold),
// to look at the record and mark it resolved.
import { useEffect, useState } from 'react'
import { useSync, useTable } from '../lib/useSync'
import { Button, Field, Notice, Page, go, inputClass, nowIso } from '../ui'

export function AlertScreen({ id }: { id: string }) {
  const alerts = useTable('alerts')
  const lines = useTable('stock_event_lines')
  const { edit, ctx } = useSync()
  const [note, setNote] = useState('')
  const unread = alerts?.find((x) => x.id === id && !x.read_at && x.user_id === ctx.userId)
  useEffect(() => { if (unread) edit('alerts', id, { read_at: nowIso() }) }, [unread, edit, id])
  if (!alerts) return null
  const a = alerts.find((x) => x.id === id)
  if (!a) return <Page title="Not found" back="/"><p className="mt-4 text-muted">That alert isn't on this phone.</p></Page>
  const line = a.record_table === 'stock_events' ? (lines ?? []).find((l) => l.stock_event_id === a.record_id) : undefined
  const recordPath = line ? `/stock/${line.mob_id}/record/${a.record_id}` : null

  return (
    <Page title={a.severity === 'urgent' ? 'Check now' : 'Alert'} back="/">
      <div className="mt-5"><Notice tone={a.severity === 'urgent' ? 'alert' : 'info'}>{String(a.message)}</Notice></div>
      {recordPath && <Button kind="secondary" className="mt-4 w-full" onClick={() => go(recordPath)}>Open the record</Button>}
      {a.resolved_at ? (
        <p className="mt-6 text-sm text-muted">Resolved{a.resolution_note ? `: ${a.resolution_note}` : ''}.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <Field id="note" label="What was done" hint="e.g. buyer told, stock held back, date was wrong and has been fixed">
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </Field>
          <Button onClick={async () => { await edit('alerts', id, { resolved_at: nowIso(), resolved_by: ctx.userId, resolution_note: note.trim() || null }); go('/') }}>Mark resolved</Button>
        </div>
      )}
    </Page>
  )
}
