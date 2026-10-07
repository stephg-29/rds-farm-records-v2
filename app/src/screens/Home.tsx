// Home: the farm, sync status, then each person's own choice of cards,
// number tiles and quick buttons, in their order (More, Customise).
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useFarm } from '../lib/useFarm'
import { openRecounts } from '../lib/stock'
import { useStock } from '../lib/useStock'
import { useHealth } from '../lib/useHealth'
import { reminders } from '../lib/reminders'
import { useFeed } from './Feed'
import { todayLocal } from '../lib/stock'
import { SPECIES_LABEL, fmtDate } from './stockParts'
import { useOutbox, useSync, useTable } from '../lib/useSync'
import { usePrefs } from '../lib/usePrefs'
import { Button, Card, Notice, Page, Section, go } from '../ui'

// The number tiles and quick buttons people can put on their Home.
export const HOME_TILES: { key: string; label: string; module?: string }[] = [
  { key: 'withhold', label: 'Mobs under withhold', module: 'treatments' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'feed_days', label: 'Days of feed left', module: 'feed' },
  { key: 'mobs', label: 'Mobs' },
  { key: 'recounts', label: 'Recounts due' },
  { key: 'paddocks', label: 'Paddocks' },
  { key: 'issues', label: 'Open issues', module: 'issues' },
  { key: 'jobs', label: 'Open contractor jobs', module: 'contractor_jobs' },
  { key: 'rain_month', label: 'Rain this month (mm)', module: 'rainfall' },
]
export type HomeAction = { key: string; label: string; short: string; path: string; module?: string }
export const HOME_ACTIONS: HomeAction[] = [
  { key: 'move', label: 'Move a mob', short: 'Move', path: '/stock' },
  { key: 'treat', label: 'Record a treatment', short: 'Treat', path: '/records/treatments/new', module: 'treatments' },
  { key: 'chemicals', label: 'Chemicals', short: 'Chemicals', path: '/records/chemicals', module: 'chemical_inventory' },
  { key: 'feed', label: 'Feed a mob', short: 'Feed', path: '/records/feed/feed', module: 'feed' },
  { key: 'add_mob', label: 'Add a mob', short: 'Add mob', path: '/stock/new' },
  { key: 'issue', label: 'Report an issue', short: 'Issue', path: '/issues/new', module: 'issues' },
  { key: 'spray', label: 'Record spraying', short: 'Spray', path: '/records/spray/new', module: 'spray' },
  { key: 'pasture', label: 'Record fertiliser or sowing', short: 'Pasture', path: '/records/pasture/new', module: 'pasture' },
  { key: 'rain', label: 'Record rain', short: 'Rain', path: '/records/rainfall', module: 'rainfall' },
  { key: 'job', label: 'New contractor job', short: 'New job', path: '/jobs/new', module: 'contractor_jobs' },
  { key: 'map', label: 'Map', short: 'Map', path: '/map' },
]
type TileValue = { n: number | string; label: string; alert?: boolean; module?: string; onClick: () => void }

export function Home() {
  const { state } = useSync()
  const { ready, settings, me, tier, modules } = useFarm()
  const prefs = usePrefs()
  const on = (module?: string) => !module || !!modules.find((m) => m.key === module)?.visible
  const properties = useTable('properties')
  const firstLoad = !settings && !state.lastSyncedAt
  const paddocks = useTable('paddocks')
  const liveProps = (properties ?? []).filter((p) => !p.archived_at).length
  const livePaddocks = (paddocks ?? []).filter((p) => !p.archived_at).length
  const noProperties = properties !== undefined && liveProps === 0
  const stock = useStock()
  const health = useHealth(stock.mobName)
  const alerts = (useTable('alerts') ?? []).filter((a) => !a.resolved_at).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  const onHand = stock.mobs.reduce((n, m) => n + Math.max(0, m.head), 0)
  const mobCount = stock.mobs.filter((m) => m.head > 0).length
  const recounts = stock.mobs.filter((m) => openRecounts(stock.data, m.id).length > 0).length
  const underWithhold = stock.mobs.filter((m) => m.head > 0 && health.active.has(m.id)).length
  const feed = useFeed()
  const vehicles = useTable('vehicles') ?? []
  const services = useTable('vehicle_services') ?? []
  const documents = useTable('documents') ?? []
  const joinings = useTable('joinings') ?? []
  const feedDays = feed.view.map((i) => i.daysLeft).filter((d): d is number => d !== null)
  const feedLeft = feedDays.length ? Math.min(...feedDays) : null
  const coming = reminders({ today: todayLocal(), stock: stock.data, mobs: stock.mobs, active: health.active, chem: health.chem, vehicles, services, documents, joinings, feed: feed.view })
  const issues = (useTable('issues') ?? []).filter((i) => i.status !== 'done').length
  const jobs = (useTable('jobs') ?? []).filter((j) => j.status === 'open').length
  const monthStart = todayLocal().slice(0, 8) + '01'
  const rainMonth = (useTable('readings') ?? []).filter((r) => r.measure === 'rainfall_mm' && String(r.observed_at).slice(0, 10) >= monthStart)
    .reduce((n, r) => n + Number(r.value), 0)
  const tileValues: Record<string, TileValue> = {
    withhold: { n: underWithhold, label: 'Mobs under withhold', alert: underWithhold > 0, module: 'treatments', onClick: () => go('/stock') },
    reminders: { n: coming.length, label: 'Reminders', onClick: () => document.getElementById('coming-up')?.scrollIntoView({ behavior: 'smooth' }) },
    feed_days: { n: feedLeft ?? '–', label: 'Days of feed left', alert: feedLeft !== null && feedLeft < 14, module: 'feed', onClick: () => go('/records/feed') },
    mobs: { n: mobCount, label: 'Mobs', onClick: () => go('/stock') },
    recounts: { n: recounts, label: 'Recounts due', alert: recounts > 0, onClick: () => go('/stock') },
    paddocks: { n: livePaddocks, label: `Paddocks on ${liveProps} ${liveProps === 1 ? 'property' : 'properties'}`, onClick: () => go('/setup/properties') },
    issues: { n: issues, label: 'Open issues', alert: issues > 0, module: 'issues', onClick: () => go('/issues') },
    jobs: { n: jobs, label: 'Open contractor jobs', module: 'contractor_jobs', onClick: () => go('/jobs') },
    rain_month: { n: Math.round(rainMonth * 10) / 10, label: 'mm of rain this month', module: 'rainfall', onClick: () => go('/records/rainfall') },
  }
  const bySpecies = Object.entries(stock.mobs.filter((m) => m.head > 0).reduce<Record<string, { head: number; mobs: number }>>((acc, m) => {
    acc[m.species] = { head: (acc[m.species]?.head ?? 0) + m.head, mobs: (acc[m.species]?.mobs ?? 0) + 1 }
    return acc
  }, {}))

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
          {alerts.map((a) => (
            <button key={String(a.id)} onClick={() => go(`/alerts/${a.id}`)} className={`mt-3 block w-full rounded-2xl border px-4 py-3 text-left ${a.severity === 'urgent' ? 'border-alert/30 bg-alert-soft text-alert-ink' : 'border-line bg-card'}`}>
              <div className="font-semibold">{a.severity === 'urgent' ? 'Check now' : 'Alert'}</div>
              <div className="text-sm">{String(a.message)}</div>
            </button>
          ))}
          {prefs.home.blocks.map((block) => {
            if (block === 'onhand') return (
              <button key={block} onClick={() => go('/stock')} className="mt-6 block w-full rounded-3xl bg-green px-5 py-5 text-left text-paper">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] opacity-80">On hand</span>
                  <span className="text-sm opacity-80">{mobCount} {mobCount === 1 ? 'mob' : 'mobs'} ›</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-5xl">{onHand.toLocaleString('en-AU')}</span>
                  <span className="opacity-80">head</span>
                </div>
                {bySpecies.length > 1 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {bySpecies.map(([sp, v]) => <span key={sp} className="rounded-xl bg-paper/10 px-3 py-2 text-sm"><b className="font-semibold">{v.head}</b> {SPECIES_LABEL[sp] ?? sp} · {v.mobs} {v.mobs === 1 ? 'mob' : 'mobs'}</span>)}
                  </div>
                )}
                {recounts > 0 && <div className="mt-2 text-sm text-butter">{recounts} {recounts === 1 ? 'mob needs' : 'mobs need'} a recount</div>}
              </button>
            )
            if (block === 'tiles') {
              const shown = prefs.home.tiles.map((k) => tileValues[k]).filter((x): x is TileValue => !!x && on(x.module))
              return shown.length > 0 && (
                <div key={block} className="mt-3 grid grid-cols-3 gap-3">
                  {shown.map((x) => <Tile key={x.label} n={x.n} label={x.label} tone={x.alert ? 'text-alert' : ''} onClick={x.onClick} />)}
                </div>
              )
            }
            if (block === 'actions') {
              const shown = prefs.home.actions.map((k) => HOME_ACTIONS.find((x) => x.key === k)).filter((x): x is HomeAction => !!x && on(x.module))
              return shown.length > 0 && (
                <div key={block} className="mt-3 grid grid-cols-3 gap-3">
                  {shown.map((x) => <QuickAction key={x.key} label={x.short} onClick={() => go(x.path)} />)}
                </div>
              )
            }
            return (
              <Section key={block} title="Coming up">
                <div id="coming-up" />
                {coming.length === 0 ? <p className="text-sm text-muted">Nothing due.</p> : (
                  <Card>
                    {coming.slice(0, 12).map((r, i) => (
                      <button key={i} onClick={() => go(r.path)} className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-paper">
                        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${r.tone === 'alert' ? 'bg-alert' : r.tone === 'warn' ? 'bg-amber' : 'bg-green'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block">{r.text}</span>
                          <span className="block text-sm text-muted">{fmtDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}{r.detail ? ` · ${r.detail}` : ''}</span>
                        </span>
                      </button>
                    ))}
                  </Card>
                )}
              </Section>
            )
          })}
          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">Signed in as {String(me.full_name)} ({String(me.role)}).</p>
            <button onClick={() => go('/more/customise')} className="shrink-0 text-sm font-semibold text-green underline">Customise Home</button>
          </div>
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

function Tile({ n, label, onClick, tone = '' }: { n: number | string; label: string; onClick: () => void; tone?: string }) {
  return (
    <button onClick={onClick} className="flex min-h-24 flex-col justify-between rounded-2xl border border-line bg-card p-3 text-left">
      <span className={`font-display text-3xl ${tone}`}>{n}</span>
      <span className="text-xs leading-tight text-muted">{label}</span>
    </button>
  )
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="h-14 rounded-2xl border border-line bg-card font-semibold">{label}</button>
}
