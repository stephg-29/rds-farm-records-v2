import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { config, supabase } from './lib/supabase'
import { openFarmDb } from './lib/db'
import { prepareForUser, type SyncContext } from './lib/sync'
import { supabaseRemote } from './lib/remote'
import { SyncProvider } from './lib/useSync'
import { Field, Screen, TabBar, inputClass, useRoute } from './ui'
import { Home } from './screens/Home'
import { FarmDetails, ModulesScreen, SetupMenu } from './screens/Setup'
import { PaddockScreen, PropertyList, PropertyScreen } from './screens/Properties'
import { ClassesScreen, PickListMenu, PickListScreen } from './screens/Lists'
import { SyncProblems } from './screens/SyncProblems'

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
      <Routes />
    </SyncProvider>
  )
}

function Routes() {
  const route = useRoute()
  return (
    <>
      <RouteScreen route={route} />
      <TabBar route={route} />
    </>
  )
}

function RouteScreen({ route: [a, b, c] }: { route: string[] }) {
  if (a === 'sync') return <SyncProblems />
  if (a === 'setup') {
    if (!b) return <SetupMenu />
    if (b === 'farm') return <FarmDetails />
    if (b === 'modules') return <ModulesScreen />
    if (b === 'properties') return c ? <PropertyScreen id={c} /> : <PropertyList />
    if (b === 'paddocks' && c) return <PaddockScreen id={c} />
    if (b === 'lists') return c ? <PickListScreen name={c} /> : <PickListMenu />
    if (b === 'classes') return <ClassesScreen />
  }
  return <Home />
}
