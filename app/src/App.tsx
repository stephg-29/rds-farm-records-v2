import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type FarmStatus = {
  farmName: string
  tier: number
  role: string | null
  fullName: string | null
  modules: { key: string; name: string; status: string }[]
}

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

function SignedIn({ session }: { session: Session }) {
  const [status, setStatus] = useState<FarmStatus | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [settings, profile, modules] = await Promise.all([
        supabase!.from('farm_settings').select('farm_name, tier').single(),
        supabase!.from('profiles').select('full_name, role').eq('user_id', session.user.id).maybeSingle(),
        supabase!.from('farm_modules').select('key, name, status').order('sort_order'),
      ])
      if (!profile.data) {
        setProblem("Your login works, but it isn't set up for this farm yet. Ask the farm owner to add you.")
        return
      }
      setStatus({
        farmName: settings.data?.farm_name ?? 'My farm',
        tier: settings.data?.tier ?? 1,
        role: profile.data.role,
        fullName: profile.data.full_name,
        modules: modules.data ?? [],
      })
    }
    load()
  }, [session.user.id])

  return (
    <Screen>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{status ? `Tier ${status.tier}` : 'Farm Records'}</div>
          <h1 className="mt-1 text-3xl text-green-deep">{status?.farmName ?? 'Farm Records'}</h1>
        </div>
        <button onClick={() => supabase!.auth.signOut()} className="h-11 rounded-full border border-line bg-card px-4 text-sm font-medium">
          Sign out
        </button>
      </div>
      {problem && <p className="mt-6 rounded-xl bg-amber-soft px-4 py-3 text-sm">{problem}</p>}
      {status && (
        <>
          <p className="mt-4 text-muted">Signed in as {status.fullName} ({status.role}).</p>
          <h2 className="mt-8 text-xl text-green-deep">Modules</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
            {status.modules.map((m) => (
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
