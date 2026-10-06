// The sync engine's link to the farm's Supabase database.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Row } from './db'
import type { Failure, Remote } from './sync'

type ErrorLike = { code?: string; message?: string } | null

// No signal, a server hiccup or an expired login: try again later.
// Anything else means the server looked at the change and turned it down.
function failure(error: ErrorLike, status: number): Failure {
  const code = error?.code ?? ''
  const offline = code === '' || status === 0 || status >= 500 || code === 'PGRST301' || code === 'PGRST303'
  return { ok: false, offline, code: code || undefined, message: FRIENDLY[code] ?? error?.message ?? 'Unknown error' }
}

// Plain wording for the common database refusals. The database's own
// messages (tier, modules, withholds) are already written for people.
const FRIENDLY: Record<string, string> = {
  '23505': "There's already one with that name.",
  '42501': "Your login isn't allowed to make this change.",
  '23503': "It refers to something that isn't saved or no longer exists.",
  '23502': 'Something required was left blank.',
}

// Development only: localStorage 'fr-simulate-offline' = '1' makes every
// request behave as if there's no signal, to test offline use without
// touching the farm's database. Ignored in the built app.
function simulatedOffline(): Failure | null {
  try {
    if (import.meta.env.DEV && localStorage.getItem('fr-simulate-offline') === '1') {
      return { ok: false, offline: true, message: 'Simulated: no signal' }
    }
  } catch { /* storage unavailable */ }
  return null
}

export function supabaseRemote(sb: SupabaseClient): Remote {
  const real = realRemote(sb)
  const wrap = <A extends unknown[], R>(f: (...a: A) => Promise<R>) => (...a: A): Promise<R | Failure> =>
    simulatedOffline() ? Promise.resolve(simulatedOffline()!) : f(...a)
  return {
    pull: wrap(real.pull),
    insert: wrap(real.insert),
    update: wrap(real.update),
    exists: wrap(real.exists),
    view: wrap(real.view),
  } as Remote
}

function realRemote(sb: SupabaseClient): Remote {
  return {
    async pull(table, key, since, offset, limit) {
      let q = sb.from(table).select('*').order('created_at').order(key).range(offset, offset + limit - 1)
      if (since) q = q.or(`created_at.gt.${since},updated_at.gt.${since}`)
      const { data, error, status } = await q
      return error ? failure(error, status) : { ok: true, rows: (data ?? []) as Row[] }
    },

    async insert(table, row) {
      const { data, error, status } = await sb.from(table).insert(row).select().maybeSingle()
      return error ? failure(error, status) : { ok: true, row: (data as Row | null) ?? null }
    },

    async update(table, key, id, patch) {
      const { data, error, status } = await sb.from(table).update(patch).eq(key, id).select()
      if (error) return failure(error, status)
      if (!data || data.length === 0) {
        return { ok: false, offline: false, code: 'NOT_ALLOWED', message: "This record couldn't be changed with your login." }
      }
      return { ok: true, row: data[0] as Row }
    },

    async exists(table, key, id) {
      const { data, error, status } = await sb.from(table).select(key).eq(key, id).maybeSingle()
      return error ? failure(error, status) : { ok: true, exists: !!data }
    },

    async view(name) {
      const { data, error, status } = await sb.from(name).select('*')
      return error ? failure(error, status) : { ok: true, rows: (data ?? []) as Row[] }
    },
  }
}
