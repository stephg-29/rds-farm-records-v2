import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { config, supabase } from './lib/supabase'
import { openFarmDb } from './lib/db'
import { prepareForUser, type SyncContext } from './lib/sync'
import { supabaseRemote } from './lib/remote'
import { SyncProvider, useOutbox, useSync, useTable, useView } from './lib/useSync'

export default function App() {
  if (!supabase) return <NotConfigured />
  return <Connected />
}

function NotConfigured() {
  return (
    <Screen>
      <h1 className="text-3xl text-green-deep">Farm Records</h1>
      <p className="mt-3 text-muted">
        This app isn't connected to a farm yet. Copy <code>config.example.js</code> to <code>config.js</code> and add the
        farm's Supabase address and publishable key.
      </p>
    </Screen>
  )
}

function Connected() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase!.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return <Screen><p className="text-muted">Loading…</p></Screen>
  return session ? <SignedIn session={session} /> : <SignIn />
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    if (error) setError('That email and password didn\'t match. Check them and try again.')
    setBusy(false)
  }

  return (
    <Screen>
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Rural Data Services</div>
      <h1 className="mt-1 text-4xl text-green-deep">Farm Records</h1>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <Field id="email" label="Email">
          <input id="email" type="email" autoComplete="username" required value={email}
            onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field id="password" label="Password">
          <input id="password" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        {error && <p className="rounded-xl bg-alert-soft px-4 py-3 text-sm text-alert-ink">{error}</p>}
        <button type="submit" disabled={busy}
          className="h-13 rounded-2xl bg-green font-semibold text-paper disabled:opacity-60">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Screen>
  )
}

// Opens this farm's records on the phone and starts syncing.
function SignedIn({ session }: { session: Session }) {
  const [ctx, setCtx] = useState<SyncContext | null>(null)

  useEffect(() => {
    let live = true
    const db = openFarmDb(config!.supabaseUrl)
    prepareForUser(db, session.user.id).then((deviceId) => {
      if (live) setCtx({ db, remote: supabaseRemote(supabase!), userId: session.user.id, deviceId })
    })
    return () => { live = false }
  }, [session.user.id])

  if (!ctx) return <Screen><p className="text-muted">Loading…</p></Screen>
  return (
    <SyncProvider ctx={ctx}>
      <Home />
    </SyncProvider>
  )
}

type ModuleRow = { key: string; name: string; status: string; sort_order: number }

function Home() {
  const { ctx, state } = useSync()
  const settings = useTable('farm_settings')
  const profiles = useTable('profiles')
  const modules = useView<ModuleRow>('farm_modules')
  const farm = settings?.[0]
  const me = profiles?.find((p) => p.user_id === ctx.userId)
  const firstLoad = !farm && !state.lastSyncedAt

  return (
    <Screen>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{farm ? `Tier ${farm.tier}` : 'Farm Records'}</div>
          <h1 className="mt-1 text-3xl text-green-deep">{farm ? String(farm.farm_name) : 'Farm Records'}</h1>
        </div>
        <SignOut />
      </div>
      <SyncLine />
      {firstLoad && <p className="mt-6 text-muted">Getting your farm's records…</p>}
      {!firstLoad && profiles && !me && (
        <p className="mt-6 rounded-xl bg-amber-soft px-4 py-3 text-sm">
          Your login works, but it isn't set up for this farm yet. Ask the farm owner to add you.
        </p>
      )}
      {me && (
        <>
          <p className="mt-4 text-muted">Signed in as {String(me.full_name)} ({String(me.role)}).</p>
          <h2 className="mt-8 text-xl text-green-deep">Modules</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
            {[...(modules ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((m) => (
              <li key={m.key} className="flex justify-between px-4 py-3 text-sm">
                <span>{m.name}</span>
                <span className="text-muted">{m.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Screen>
  )
}

// One line saying whether everything has reached the farm's database. Tap to sync.
function SyncLine() {
  const { state, syncNow } = useSync()
  const outbox = useOutbox()
  const waiting = outbox?.waiting ?? 0
  const turnedDown = outbox?.turnedDown.length ?? 0

  let text: string
  let tone = 'text-muted'
  if (turnedDown > 0) {
    text = `${turnedDown} ${turnedDown === 1 ? 'change' : 'changes'} couldn't be saved to the farm's records`
    tone = 'text-alert-ink'
  } else if (state.syncing) {
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
    <div className="flex flex-col items-end gap-2">
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

const inputClass = 'h-12 w-full rounded-xl border border-line bg-card px-4 text-base'

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-muted">{label}</label>
      {children}
    </div>
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-full max-w-md px-5 pt-10 pb-16">{children}</main>
}
