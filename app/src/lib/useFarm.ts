// The farm, the signed-in person and the modules, from the phone's copy.
import type { Row } from './db'
import { farmModules, type FarmModule, type ModuleInfo } from './modules'
import { useSync, useTable, useView } from './useSync'

export type Farm = {
  ready: boolean
  settings: Row | undefined
  me: Row | undefined
  isOwner: boolean
  tier: number
  enabled: string[]
  catalogue: ModuleInfo[]
  modules: FarmModule[]
}

export function useFarm(): Farm {
  const { ctx } = useSync()
  const settings = useTable('farm_settings')
  const profiles = useTable('profiles')
  const catalogue = useView<ModuleInfo>('farm_modules') ?? []
  const farm = settings?.[0]
  const me = profiles?.find((p) => p.user_id === ctx.userId)
  const tier = Number(farm?.tier ?? 1)
  const enabled = (farm?.enabled_modules as string[] | undefined) ?? []
  return {
    ready: settings !== undefined && profiles !== undefined,
    settings: farm,
    me,
    isOwner: me?.role === 'owner',
    tier,
    enabled,
    catalogue,
    modules: farmModules(catalogue, tier, enabled),
  }
}
