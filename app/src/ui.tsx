// Shared building blocks for screens, in the Farm Records v2 style.
import { useEffect, useState, type ReactNode } from 'react'
import { SECTIONS, isInArea, sectionOf, type Area } from './lib/areas'

// ---- Navigation (hash routes, so the app works as plain files) -------------

function currentPath() {
  return window.location.hash.replace(/^#/, '').split('?')[0] || '/'
}

// Values after "?" in the address, e.g. #/stock/x/move?to=paddock-id
export function query(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '')
}

export function useRoute(): string[] {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const onChange = () => { setPath(currentPath()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return path.split('/').filter(Boolean).map(decodeURIComponent)
}

export function go(path: string) {
  window.location.hash = path
}

// ---- Layout -----------------------------------------------------------------

export function Screen({ children }: { children: ReactNode }) {
  return <main className="mx-auto min-h-full max-w-md px-5 pt-8 pb-44">{children}</main>
}

// Always at the bottom of the screen, so Home is one tap from anywhere.
// Home and More are fixed; the three in between are each person's choice.
type Tab = { label: string; path: string; icon: string; match: (r: string[]) => boolean }
const HOME_TAB: Tab = { label: 'Home', path: '/', icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z', match: (r) => r.length === 0 }
const MORE_TAB: Tab = { label: 'More', path: '/more', icon: 'M6.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm7 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm7 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z', match: (r) => sectionOf(r) === 'more' }

export function TabBar({ route, contractor, areas = [] }: { route: string[]; contractor?: boolean; areas?: Area[] }) {
  const middle: Tab[] = areas.map((a) => ({ label: a.label.replace('Contractor jobs', 'Jobs'), path: a.path, icon: a.icon, match: (r) => isInArea(a, r) }))
  const tabs = contractor
    ? [{ ...HOME_TAB, label: 'Jobs', match: (r: string[]) => r.length === 0 || r[0] === 'jobs' }, MORE_TAB]
    : [HOME_TAB, ...middle, { ...MORE_TAB, match: (r: string[]) => MORE_TAB.match(r) && !middle.some((t) => t.match(r)) }]
  return (
    <nav aria-label="Main" className="print:hidden fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {tabs.map((t) => {
          const active = t.match(route)
          return (
            <button key={t.path} onClick={() => go(t.path)} aria-current={active ? 'page' : undefined}
              className={`flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold ${active ? 'text-green-deep' : 'text-muted'}`}>
              <svg viewBox="0 0 24 24" aria-hidden className={`size-6 fill-none stroke-current ${active ? 'stroke-[2.2]' : 'stroke-[1.6]'}`}>
                <path d={t.icon} strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              <span className="max-w-full truncate px-0.5">{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function Page({ title, kicker, back, action, children }: {
  title: string
  kicker?: string
  back?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Screen>
      {back !== undefined && (
        <button onClick={() => go(back)} className="-ml-2 mb-3 flex h-10 items-center gap-1 rounded-full px-2 text-sm font-medium text-muted">
          <span aria-hidden className="text-lg leading-none">‹</span> Back
        </button>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {kicker && <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{kicker}</div>}
          <h1 className="mt-1 text-3xl text-green-deep">{title}</h1>
        </div>
        {action}
      </div>
      {children}
      {back !== undefined && <BottomStrip back={back} />}
    </Screen>
  )
}

// Back, and straight to the screen's section, always in reach above the
// bottom bar (no scrolling up to find them).
function BottomStrip({ back }: { back: string }) {
  const route = currentPath().split('/').filter(Boolean)
  const key = sectionOf(route)
  const section = key ? SECTIONS[key] : null
  const atSection = !section || back === section.path
  return (
    <div className="print:hidden fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-md items-center justify-between px-3">
        <button onClick={() => go(back)} className="flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-green-deep active:bg-card">
          <span aria-hidden className="text-lg leading-none">‹</span> Back
        </button>
        {!atSection && (
          <button onClick={() => go(section!.path)} className="flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-green-deep active:bg-card">
            {section!.label} <span aria-hidden className="text-lg leading-none">›</span>
          </button>
        )}
      </div>
    </div>
  )
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xl text-green-deep">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card ${className}`}>{children}</div>
}

// A tappable row in a card.
export function Row({ label, detail, value, onClick, muted }: {
  label: ReactNode
  detail?: ReactNode
  value?: ReactNode
  onClick?: () => void
  muted?: boolean
}) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${muted ? 'text-muted' : ''}`}>{label}</span>
        {detail && <span className="mt-0.5 block truncate text-sm text-muted">{detail}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-sm text-muted">{value}</span>}
      {onClick && <span aria-hidden className="shrink-0 text-lg text-muted">›</span>}
    </>
  )
  const cls = 'flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left'
  return onClick ? <button onClick={onClick} className={`${cls} active:bg-paper`}>{inner}</button> : <div className={cls}>{inner}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'alert' | 'ok'; children: ReactNode }) {
  const cls = {
    info: 'bg-sky text-sky-ink',
    warn: 'bg-amber-soft text-ink',
    alert: 'bg-alert-soft text-alert-ink',
    ok: 'bg-clear text-green-deep',
  }[tone]
  return <p role={tone === 'alert' ? 'alert' : undefined} className={`rounded-xl px-4 py-3 text-sm ${cls}`}>{children}</p>
}

// A message that must be seen wherever the person has scrolled to.
export function Popup({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[3000] grid place-items-center bg-ink/40 px-5" onClick={onClose}>
      <div role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl text-green-deep">{title}</h2>
        <div className="mt-2 text-ink">{children}</div>
        <Button className="mt-5 w-full" onClick={onClose}>OK</Button>
      </div>
    </div>
  )
}

// ---- Form parts ---------------------------------------------------------------

export const inputClass =
  'h-12 w-full rounded-xl border border-line bg-card px-4 text-base outline-none focus:border-green disabled:bg-paper disabled:text-muted'

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-muted">{label}</label>
      {children}
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  )
}

export function Button({ children, onClick, type = 'button', kind = 'primary', disabled, className = '' }: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  kind?: 'primary' | 'secondary' | 'danger' | 'quiet'
  disabled?: boolean
  className?: string
}) {
  const cls = {
    primary: 'bg-green text-paper',
    secondary: 'border border-line bg-card text-ink',
    danger: 'border border-alert/30 bg-card text-alert',
    quiet: 'text-muted',
  }[kind]
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`h-12 rounded-2xl px-5 font-semibold disabled:opacity-50 ${cls} ${className}`}>
      {children}
    </button>
  )
}

export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-8 w-13 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-green' : 'bg-line'}`}>
      <span className={`absolute top-1 left-1 size-6 rounded-full bg-card shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

// Two or more choices side by side.
export function Choice<T extends string>({ value, options, onChange, disabled }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-line bg-card p-1">
      {options.map((o) => (
        <button key={o.value} type="button" disabled={disabled} onClick={() => onChange(o.value)}
          className={`h-10 flex-1 rounded-lg text-sm font-medium ${value === o.value ? 'bg-green text-paper' : 'text-muted'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const nowIso = () => new Date().toISOString()
