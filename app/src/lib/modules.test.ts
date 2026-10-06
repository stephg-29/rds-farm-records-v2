import { describe, expect, it } from 'vitest'
import { farmModules, toggleModule, type ModuleInfo } from './modules'

const m = (key: string, min_tier = 1, is_core = false, needs_any_of: string[] = [], sort_order = 0): ModuleInfo =>
  ({ key, name: key, description: null, min_tier, is_core, needs_any_of, sort_order })
const catalogue = [m('stock', 1, true), m('spray'), m('pasture'), m('contractor_jobs', 1, false, ['spray', 'pasture']), m('individual_animals', 2)]

describe('modules', () => {
  it('works out status the same way as the database view', () => {
    const s = Object.fromEntries(farmModules(catalogue, 1, ['spray']).map((x) => [x.key, x.status]))
    expect(s).toEqual({ stock: 'core', spray: 'on', pasture: 'off', contractor_jobs: 'off', individual_animals: 'locked' })
  })

  it('will not switch on a module above the tier', () => {
    const r = toggleModule(catalogue, 1, [], 'individual_animals', true)
    expect(r.ok).toBe(false)
  })

  it('needs spray or pasture before contractor jobs', () => {
    expect(toggleModule(catalogue, 1, [], 'contractor_jobs', true).ok).toBe(false)
    expect(toggleModule(catalogue, 1, ['pasture'], 'contractor_jobs', true)).toEqual({ ok: true, enabled: ['contractor_jobs', 'pasture'] })
  })

  it('will not switch off the last module contractor jobs depends on', () => {
    expect(toggleModule(catalogue, 1, ['contractor_jobs', 'spray'], 'spray', false).ok).toBe(false)
    expect(toggleModule(catalogue, 1, ['contractor_jobs', 'spray', 'pasture'], 'spray', false).ok).toBe(true)
  })
})
