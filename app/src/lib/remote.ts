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
  return { ok: false, offline, code: code || undefined, message: error?.message ?? 'Unknown error' }
}

export function supabaseRemote(sb: SupabaseClient): Remote {
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

    async view(name) {
      const { data, error, status } = await sb.from(name).select('*')
      return error ? failure(error, status) : { ok: true, rows: (data ?? []) as Row[] }
    },
  }
}
