// Setup: the menu, farm details and module ticks.
import { useState, type FormEvent } from 'react'
import { toggleModule } from '../lib/modules'
import { useFarm } from '../lib/useFarm'
import { useSync, useTable } from '../lib/useSync'
import { Button, Card, Field, Notice, Page, Row as ListRow, Toggle, go, inputClass } from '../ui'

export function SetupMenu() {
  const { settings, modules, isOwner } = useFarm()
  const properties = useTable('properties')
  const paddocks = useTable('paddocks')
  const liveProps = (properties ?? []).filter((p) => !p.archived_at).length
  const livePaddocks = (paddocks ?? []).filter((p) => !p.archived_at).length
  const on = modules.filter((m) => m.status === 'on').length

  return (
    <Page title="Setup" kicker={settings ? String(settings.farm_name) : undefined} back="/">
      <div className="mt-6">
        <Card>
          <ListRow onClick={() => go('/setup/farm')} label="Farm details" detail="Name and tier" />
          <ListRow onClick={() => go('/setup/properties')} label="Properties and paddocks"
            detail={`${liveProps} ${liveProps === 1 ? 'property' : 'properties'}, ${livePaddocks} ${livePaddocks === 1 ? 'paddock' : 'paddocks'}`} />
          <ListRow onClick={() => go('/setup/lists')} label="Dropdown lists" detail="Treatment reasons, livestock classes and more" />
          <ListRow onClick={() => go('/setup/modules')} label="Modules" detail={`${on} switched on${isOwner ? '' : ' · set by the owner'}`} />
        </Card>
      </div>
    </Page>
  )
}

export function FarmDetails() {
  const { settings, tier, isOwner } = useFarm()
  if (!settings) return null
  return <FarmForm key={String(settings.id)} id={String(settings.id)} name={String(settings.farm_name)} tier={tier} isOwner={isOwner} />
}

function FarmForm({ id, name: initial, tier, isOwner }: { id: string; name: string; tier: number; isOwner: boolean }) {
  const { edit } = useSync()
  const [name, setName] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = name.trim().replace(/\s+/g, ' ')
    if (!n) return setError('Give the farm a name.')
    setError(null)
    await edit('farm_settings', id, { farm_name: n })
    setSaved(true)
  }

  return (
    <Page title="Farm details" kicker="Setup" back="/setup">
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <Field id="farm" label="Farm name" hint={isOwner ? 'Shown at the top of the app and on reports.' : 'Only the owner can change this.'}>
          <input id="farm" value={name} disabled={!isOwner} onChange={(e) => { setName(e.target.value); setSaved(false) }} className={inputClass} />
        </Field>
        {error && <Notice tone="alert">{error}</Notice>}
        {saved && <Notice tone="ok">Saved.</Notice>}
        {isOwner && <Button type="submit">Save</Button>}
      </form>
      <div className="mt-8 rounded-2xl border border-line bg-card px-4 py-4">
        <div className="text-sm font-semibold text-muted">Tier</div>
        <div className="mt-1 font-display text-2xl text-green-deep">Tier {tier}</div>
        <p className="mt-1 text-sm text-muted">
          {tier === 1 ? 'Mob-based farm records and map.' : tier === 2 ? 'Adds individual animals.' : 'Adds stud.'} To change tier, contact Rural Data Services.
        </p>
      </div>
    </Page>
  )
}

export function ModulesScreen() {
  const { settings, tier, enabled, catalogue, modules, isOwner } = useFarm()
  const { edit } = useSync()
  const [problem, setProblem] = useState<string | null>(null)
  if (!settings) return null

  async function change(key: string, on: boolean) {
    const r = toggleModule(catalogue, tier, enabled, key, on)
    if (!r.ok) return setProblem(r.reason)
    setProblem(null)
    await edit('farm_settings', String(settings!.id), { enabled_modules: r.enabled })
  }

  return (
    <Page title="Modules" kicker="Setup" back="/setup">
      <p className="mt-3 text-muted">
        {isOwner
          ? 'Switch off anything the farm doesn\'t use, to keep the app simple. Switching a module off only hides it. Its records are kept, and switching it back on brings them all back.'
          : 'The modules this farm uses. Only the owner can change them.'}
      </p>
      {problem && <div className="mt-4"><Notice tone="warn">{problem}</Notice></div>}
      <div className="mt-6">
        <Card>
          {modules.map((m) => (
            <div key={m.key} className="flex min-h-16 items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className={m.status === 'locked' ? 'text-muted' : ''}>{m.name}</div>
                <div className="mt-0.5 text-sm text-muted">
                  {m.status === 'locked' ? `Tier ${m.min_tier}. Contact Rural Data Services to upgrade.` : m.description}
                </div>
              </div>
              {m.status === 'core' && <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted">Always on</span>}
              {m.status === 'locked' && <span className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-muted">Locked</span>}
              {(m.status === 'on' || m.status === 'off') && (
                <Toggle label={m.name} on={m.status === 'on'} disabled={!isOwner} onChange={(v) => change(m.key, v)} />
              )}
            </div>
          ))}
        </Card>
      </div>
    </Page>
  )
}
