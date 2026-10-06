// Which modules are on, worked out on the phone so a tick shows straight away
// with no signal. Mirrors public.farm_modules and app.farm_settings_rules;
// the database still has the final say.

export type ModuleInfo = {
  key: string
  name: string
  description: string | null
  min_tier: number
  is_core: boolean
  needs_any_of: string[] | null
  sort_order: number
}

export type ModuleStatus = 'core' | 'on' | 'off' | 'locked'
export type FarmModule = ModuleInfo & { status: ModuleStatus; visible: boolean }

export function farmModules(catalogue: ModuleInfo[], tier: number, enabled: string[]): FarmModule[] {
  return [...catalogue]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => {
      const status: ModuleStatus = m.is_core ? 'core' : m.min_tier > tier ? 'locked' : enabled.includes(m.key) ? 'on' : 'off'
      return { ...m, status, visible: status === 'core' || status === 'on' }
    })
}

// What turning a module on or off would do. Returns the new list, or the
// reason it can't be done.
export function toggleModule(
  catalogue: ModuleInfo[], tier: number, enabled: string[], key: string, on: boolean,
): { ok: true; enabled: string[] } | { ok: false; reason: string } {
  const m = catalogue.find((x) => x.key === key)
  if (!m || m.is_core) return { ok: false, reason: 'This one is always on.' }
  if (on && m.min_tier > tier) return { ok: false, reason: `${m.name} needs Tier ${m.min_tier}. Contact Rural Data Services to upgrade.` }

  const next = on ? [...new Set([...enabled, key])].sort() : enabled.filter((k) => k !== key)
  const name = (k: string) => catalogue.find((x) => x.key === k)?.name ?? k
  for (const k of next) {
    const needs = catalogue.find((x) => x.key === k)?.needs_any_of ?? []
    if (needs.length > 0 && !needs.some((n) => next.includes(n))) {
      return on
        ? { ok: false, reason: `${name(k)} needs ${needs.map(name).join(' or ')} switched on first.` }
        : { ok: false, reason: `${name(k)} uses ${name(key)}. Switch ${name(k)} off first.` }
    }
  }
  return { ok: true, enabled: next }
}
