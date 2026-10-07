// Section pages as tiles (Paddocks; the Stock and More pages use the same
// tiles), every area on one page (the old Records address), and each
// person's Customise screen for their bottom bar and Home.
import { useState } from 'react'
import { AREAS, DEFAULT_NAV, SECTIONS, areaByKey, type Area, type SectionKey } from '../lib/areas'
import { useFarm } from '../lib/useFarm'
import { DEFAULT_HOME, HOME_BLOCKS, usePrefs, type HomeBlock } from '../lib/usePrefs'
import { Button, Notice, Page, Section, go } from '../ui'
import { HOME_ACTIONS, HOME_TILES } from './Home'

// Areas whose module is on (or switched off: shown greyed with a note).
export function useAreaStatus() {
  const { modules } = useFarm()
  return (a: Area): 'on' | 'off' | 'locked' => {
    if (!a.module) return 'on'
    const m = modules.find((x) => x.key === a.module)
    return !m || m.status === 'locked' ? 'locked' : m.visible ? 'on' : 'off'
  }
}

// compact: one row of small tiles (the Stock page, where the mobs come first).
export function AreaTiles({ section, compact }: { section: SectionKey; compact?: boolean }) {
  const status = useAreaStatus()
  const areas = AREAS.filter((a) => a.section === section && status(a) !== 'locked')
  if (compact) {
    const shown = areas.filter((a) => status(a) === 'on')
    return (
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, shown.length)}, minmax(0, 1fr))` }}>
        {shown.map((a) => (
          <button key={a.key} onClick={() => go(a.path)} className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-card px-1 py-3 active:bg-paper">
            <svg viewBox="0 0 24 24" aria-hidden className="size-6 fill-none stroke-green-deep stroke-[1.6]"><path d={a.icon} strokeLinejoin="round" strokeLinecap="round" /></svg>
            <span className="max-w-full truncate text-xs font-semibold">{a.label}</span>
          </button>
        ))}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {areas.map((a) => {
        const off = status(a) === 'off'
        return (
          <button key={a.key} onClick={() => go(off ? '/setup/modules' : a.path)}
            className={`flex min-h-28 flex-col justify-between rounded-2xl border border-line bg-card p-4 text-left active:bg-paper ${off ? 'opacity-50' : ''}`}>
            <svg viewBox="0 0 24 24" aria-hidden className="size-7 fill-none stroke-green-deep stroke-[1.6]"><path d={a.icon} strokeLinejoin="round" strokeLinecap="round" /></svg>
            <span>
              <span className="block font-semibold leading-tight">{a.label}</span>
              <span className="mt-0.5 block text-xs leading-tight text-muted">{off ? 'Switched off. Turn it on in Modules.' : a.detail}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function PaddocksHub() {
  return (
    <Page title="Paddocks">
      <p className="mt-2 text-muted">Paddocks, spraying, pasture, issues and rain.</p>
      <div className="mt-5"><AreaTiles section="paddocks" /></div>
      <Button kind="secondary" className="mt-4 w-full" onClick={() => go('/map')}>Open the map</Button>
    </Page>
  )
}

// The old Records address: every area, by section.
export function AllAreas() {
  return (
    <Page title="Everything" back="/">
      {(Object.keys(SECTIONS) as SectionKey[]).map((k) => (
        <Section key={k} title={SECTIONS[k].label}><AreaTiles section={k} /></Section>
      ))}
    </Page>
  )
}

// ---- Customise -------------------------------------------------------------------

const move = <T,>(list: T[], i: number, by: number) => {
  const next = [...list]
  const j = i + by
  if (j < 0 || j >= next.length) return list
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

export function CustomiseScreen() {
  const prefs = usePrefs()
  const status = useAreaStatus()
  const [nav, setNav] = useState<string[] | null>(null)
  const [blocks, setBlocks] = useState<HomeBlock[] | null>(null)
  const [tiles, setTiles] = useState<string[] | null>(null)
  const [actions, setActions] = useState<string[] | null>(null)
  const [saved, setSaved] = useState(false)
  if (!prefs.ready) return null
  const n = nav ?? prefs.nav
  const b = blocks ?? prefs.home.blocks
  const t = tiles ?? prefs.home.tiles
  const ac = actions ?? prefs.home.actions
  const changed = nav || blocks || tiles || actions
  const navChoices = AREAS.filter((a) => status(a) === 'on')
  const touch = () => setSaved(false)

  async function save() {
    await prefs.save({ nav: n, home: { blocks: b, tiles: t, actions: ac } })
    setNav(null); setBlocks(null); setTiles(null); setActions(null); setSaved(true)
  }

  return (
    <Page title="Customise" kicker="More" back="/more">
      <p className="mt-2 text-muted">Set the app up the way you use it. These choices are yours: they follow your login to any phone, and don't change anyone else's.</p>

      <Section title="Bottom bar">
        <p className="-mt-1 mb-3 text-sm text-muted">Home and More are always there. Choose the three in between.</p>
        <div className="flex flex-col gap-2">
          {n.map((key, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
              <span className="w-6 text-center text-sm text-muted">{i + 1}</span>
              <select aria-label={`Bottom bar slot ${i + 1}`} value={key} onChange={(e) => { touch(); setNav(n.map((x, j) => (j === i ? e.target.value : x))) }}
                className="h-12 rounded-xl border border-line bg-card px-3">
                {navChoices.filter((a) => a.key === key || !n.includes(a.key)).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
              <Arrow label="Move left" disabled={i === 0} onClick={() => { touch(); setNav(move(n, i, -1)) }}>↑</Arrow>
              <Arrow label="Move right" disabled={i === n.length - 1} onClick={() => { touch(); setNav(move(n, i, 1)) }}>↓</Arrow>
            </div>
          ))}
        </div>
        <button className="mt-2 text-sm font-medium text-green underline" onClick={() => { touch(); setNav(DEFAULT_NAV) }}>Back to Map, Stock, Paddocks</button>
      </Section>

      <Section title="Home: what shows, in order">
        <Picker
          all={HOME_BLOCKS.map((x) => ({ key: x.key, label: x.label }))}
          chosen={b} onChange={(v) => { touch(); setBlocks(v as HomeBlock[]) }} />
        <p className="mt-2 text-xs text-muted">"Check now" alerts (e.g. a sale inside a withhold) always show at the top.</p>
      </Section>

      {b.includes('tiles') && (
        <Section title="Number tiles">
          <Picker all={HOME_TILES.filter((x) => !x.module || status({ module: x.module } as Area) === 'on')} chosen={t} max={6} onChange={(v) => { touch(); setTiles(v) }} />
        </Section>
      )}
      {b.includes('actions') && (
        <Section title="Quick buttons">
          <Picker all={HOME_ACTIONS.filter((x) => !x.module || status({ module: x.module } as Area) === 'on')} chosen={ac} max={6} onChange={(v) => { touch(); setActions(v) }} />
        </Section>
      )}

      <div className="mt-8 flex flex-col gap-3">
        {saved && !changed && <Notice tone="ok">Saved. It's on any phone you sign in on.</Notice>}
        <Button onClick={save} disabled={!changed}>Save</Button>
        <Button kind="quiet" onClick={() => { touch(); setNav(DEFAULT_NAV); setBlocks(DEFAULT_HOME.blocks); setTiles(DEFAULT_HOME.tiles); setActions(DEFAULT_HOME.actions) }}>Start again from the standard layout</Button>
      </div>
    </Page>
  )
}

// Tick what shows; the ticked ones can be put in order.
function Picker({ all, chosen, onChange, max }: { all: { key: string; label: string }[]; chosen: string[]; onChange: (v: string[]) => void; max?: number }) {
  const known = chosen.filter((k) => all.some((x) => x.key === k))
  const rest = all.filter((x) => !known.includes(x.key))
  const label = (k: string) => all.find((x) => x.key === k)?.label ?? k
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
      {known.map((k, i) => (
        <div key={k} className="flex min-h-14 items-center gap-2 px-3">
          <input type="checkbox" checked onChange={() => onChange(known.filter((x) => x !== k))} aria-label={`Show ${label(k)}`} className="size-5 accent-green" />
          <span className="flex-1">{label(k)}</span>
          <Arrow label={`Move ${label(k)} up`} disabled={i === 0} onClick={() => onChange(move(known, i, -1))}>↑</Arrow>
          <Arrow label={`Move ${label(k)} down`} disabled={i === known.length - 1} onClick={() => onChange(move(known, i, 1))}>↓</Arrow>
        </div>
      ))}
      {rest.map((x) => {
        const full = max !== undefined && known.length >= max
        return (
          <label key={x.key} className={`flex min-h-14 items-center gap-2 px-3 ${full ? 'opacity-50' : ''}`}>
            <input type="checkbox" checked={false} disabled={full} onChange={() => onChange([...known, x.key])} className="size-5 accent-green" />
            <span className="flex-1 text-muted">{x.label}</span>
          </label>
        )
      })}
      {max !== undefined && <p className="px-3 py-2 text-xs text-muted">Up to {max}.</p>}
    </div>
  )
}

function Arrow({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: string }) {
  return <button aria-label={label} disabled={disabled} onClick={onClick} className="size-10 rounded-full text-muted disabled:opacity-20">{children}</button>
}

// The areas a person's bottom bar shows (switched-off ones skipped, with the
// standard ones filling in).
export function useNavAreas(): Area[] {
  const prefs = usePrefs()
  const status = useAreaStatus()
  const picked = prefs.nav.map(areaByKey).filter((a): a is Area => !!a && status(a) === 'on')
  for (const k of DEFAULT_NAV) if (picked.length < 3 && !picked.some((a) => a.key === k)) picked.push(areaByKey(k)!)
  return picked.slice(0, 3)
}
