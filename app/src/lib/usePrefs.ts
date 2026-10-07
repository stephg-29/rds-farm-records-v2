// A person's own settings (user_preferences, one row keyed by their user
// id): their bottom bar and their Home layout. Saved like any record, so it
// works offline and follows them to another phone.
import { useMemo } from 'react'
import { DEFAULT_NAV } from './areas'
import { useSync, useTable } from './useSync'

export type HomeBlock = 'onhand' | 'tiles' | 'actions' | 'coming'
export type Prefs = {
  nav?: string[]
  home?: { blocks?: HomeBlock[]; tiles?: string[]; actions?: string[] }
}

export const HOME_BLOCKS: { key: HomeBlock; label: string }[] = [
  { key: 'onhand', label: 'Stock on hand' },
  { key: 'tiles', label: 'Number tiles' },
  { key: 'actions', label: 'Quick buttons' },
  { key: 'coming', label: 'Coming up' },
]
export const DEFAULT_HOME = {
  blocks: ['onhand', 'tiles', 'actions', 'coming'] as HomeBlock[],
  tiles: ['withhold', 'reminders', 'feed_days'],
  actions: ['move', 'treat', 'chemicals'],
}

export function usePrefs() {
  const { ctx, add, edit } = useSync()
  const rows = useTable('user_preferences')
  const row = rows?.find((r) => r.id === ctx.userId)
  return useMemo(() => {
    const prefs = (row?.prefs ?? {}) as Prefs
    const nav = Array.isArray(prefs.nav) && prefs.nav.length === 3 ? prefs.nav : DEFAULT_NAV
    const home = {
      blocks: prefs.home?.blocks ?? DEFAULT_HOME.blocks,
      tiles: prefs.home?.tiles ?? DEFAULT_HOME.tiles,
      actions: prefs.home?.actions ?? DEFAULT_HOME.actions,
    }
    const save = async (next: Prefs) => {
      const merged = { ...prefs, ...next }
      if (row) await edit('user_preferences', ctx.userId, { prefs: merged })
      else await add('user_preferences', { id: ctx.userId, prefs: merged })
    }
    return { ready: rows !== undefined, nav, home, save }
  }, [row, rows, ctx.userId, add, edit])
}
