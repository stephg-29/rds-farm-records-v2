// Home: the farm, sync status, and the modules this farm uses.
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useFarm } from '../lib/useFarm'
import { useOutbox, useSync, useTable } from '../lib/useSync'
import { Button, Notice, Page, go } from '../ui'

export function Home() {
  const { state } = useSync()
  const { ready, settings, me, tier, modules } = useFarm()
  const properties = useTable('properties')
  const firstLoad = !settings && !state.lastSyncedAt
  const noProperties = properties !== undefined && properties.filter((p) => !p.archived_at).length === 0
  const tiles = modules.filter((m) => m.visible && m.key !== 'paddocks')

  return (
    <Page title={settings ? String(settings.farm_name) : 'Farm Records'} kicker={settings ? `Tier ${tier}` : undefined} action={<SignOut />}>
      <SyncLine />
      {firstLoad && <p className="mt-6 text-muted">Getting your farm's records…</p>}
      {ready && !firstLoad && !me && (
        <div className="mt-6"><Notice tone="warn">Your login works, but it isn't set up for this farm yet. Ask the farm owner to add you.</Notice></div>
      )}
      {me && (
        <>
          {noProperties && (
            <div className="mt-6 rounded-2xl bg-butter px-4 py-4">
              <div className="font-display text-xl text-green-deep">Start by adding your properties</div>
              <p className="mt-1 text-sm">Add each property with its PIC, then its paddocks. Everything else hangs off these.</p>
              <Button className="mt-3" onClick={() => go('/setup/properties/new')}>Add a property</Button>
            </div>
          )}
          <div className="mt-6 grid grid-cols-2 gap-3">
            {tiles.map((m) => (
              <div key={m.key} className="flex min-h-24 flex-col justify-between rounded-2xl border border-line bg-card p-4">
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-muted">Coming soon</div>
              </div>
            ))}
            <button onClick={() => go('/setup')} className="flex min-h-24 flex-col justify-between rounded-2xl bg-green p-4 text-left text-paper">
              <div className="font-medium">Setup</div>
              <div className="text-xs opacity-80">Properties, paddocks, lists, modules</div>
            </button>
          </div>
          <p className="mt-6 text-sm text-muted">Signed in as {String(me.full_name)} ({String(me.role)}).</p>
        </>
      )}
    </Page>
  )
}

// One line saying whether everything has reached the farm's database. Tap to sync.
function SyncLine() {
  const { state, syncNow } = useSync()
  const outbox = useOutbox()
  const waiting = outbox?.waiting ?? 0
  const turnedDown = outbox?.turnedDown.length ?? 0

  if (turnedDown > 0) {
    return (
      <button onClick={() => go('/sync')} className="mt-3 flex items-center gap-2 text-left text-sm font-medium text-alert-ink">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
        {turnedDown} {turnedDown === 1 ? 'change' : 'changes'} couldn't be saved. Tap to see why
      </button>
    )
  }

  let text: string
  let tone = 'text-muted'
  if (state.syncing) {
    text = 'Syncing…'
  } else if (state.offlineMessage || !state.online) {
    text = waiting > 0 ? `No signal. ${waiting} saved on this phone, will send when there's signal` : 'No signal. Showing the last copy on this phone'
    tone = 'text-amber'
  } else if (waiting > 0) {
    text = `${waiting} waiting to send`
  } else {
    text = state.lastSyncedAt
      ? `All synced ${state.lastSyncedAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`
      : 'Not synced yet'
  }

  return (
    <button onClick={syncNow} className={`mt-3 flex items-center gap-2 text-left text-sm ${tone}`}>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${tone === 'text-muted' ? 'bg-green' : 'bg-current'}`} />
      {text}
    </button>
  )
}

// Signing out with unsent changes would strand them, so it waits until they've sent.
function SignOut() {
  const outbox = useOutbox()
  const [blocked, setBlocked] = useState(false)
  const waiting = outbox?.waiting ?? 0

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <button
        onClick={() => (waiting > 0 ? setBlocked(true) : supabase!.auth.signOut())}
        className="h-11 rounded-full border border-line bg-card px-4 text-sm font-medium">
        Sign out
      </button>
      {blocked && waiting > 0 && (
        <p className="max-w-56 rounded-xl bg-amber-soft px-3 py-2 text-right text-xs">
          {waiting} {waiting === 1 ? "change hasn't" : "changes haven't"} sent yet. Sign out once they have, so nothing is lost.
        </p>
      )}
    </div>
  )
}
