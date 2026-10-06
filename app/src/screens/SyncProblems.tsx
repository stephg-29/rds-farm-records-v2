// Changes the farm's database turned down, with the reason, so they can be
// fixed (by editing the record again) or dropped.
import { useState } from 'react'
import type { OutboxItem } from '../lib/db'
import { discardChange } from '../lib/sync'
import { useOutbox, useSync } from '../lib/useSync'
import { Button, Card, Empty, Notice, Page } from '../ui'

const LABELS: Record<string, string> = {
  farm_settings: 'Farm details',
  profiles: 'Person',
  properties: 'Property',
  paddocks: 'Paddock',
  pick_lists: 'List item',
  livestock_classes: 'Livestock class',
  contacts: 'Contact',
}

function describe(item: OutboxItem) {
  const what = LABELS[item.table] ?? item.table
  const p = item.patch
  const name = p.name ?? p.value ?? p.farm_name
  if (item.op === 'insert') return `New ${what.toLowerCase()}${name ? `: ${name}` : ''}`
  if ('archived_at' in p) return `${what} ${p.archived_at ? 'archived' : 'restored'}`
  return `Change to ${what.toLowerCase()}${name ? `: ${name}` : ''}`
}

export function SyncProblems() {
  const { ctx, syncNow } = useSync()
  const outbox = useOutbox()
  const [confirm, setConfirm] = useState<number | null>(null)
  const items = outbox?.turnedDown ?? []

  return (
    <Page title="Couldn't be saved" kicker="Sync" back="/">
      <p className="mt-3 text-muted">
        These are saved on this phone, but the farm's records turned them down. Change the record and it will try again, or drop the change.
      </p>
      <div className="mt-6">
        {outbox && items.length === 0 && <Empty>Nothing waiting. Everything has been saved.</Empty>}
        {items.length > 0 && (
          <Card>
            {items.map((item) => (
              <div key={item.seq} className="flex flex-col gap-2 px-4 py-4">
                <div className="font-medium">{describe(item)}</div>
                <Notice tone="alert">{item.lastError}</Notice>
                <div className="text-xs text-muted">Made {new Date(item.queuedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                {confirm === item.seq ? (
                  <div className="flex gap-2">
                    <Button kind="danger" className="flex-1" onClick={() => { discardChange(ctx, item.seq!); setConfirm(null) }}>Yes, drop it</Button>
                    <Button kind="secondary" onClick={() => setConfirm(null)}>Keep</Button>
                  </div>
                ) : (
                  <Button kind="secondary" onClick={() => setConfirm(item.seq!)}>Drop this change</Button>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>
      {items.length > 0 && <Button kind="quiet" className="mt-4 w-full" onClick={syncNow}>Try again now</Button>}
    </Page>
  )
}
