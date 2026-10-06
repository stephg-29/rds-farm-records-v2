// Farm Records v2 · invite-user
//
// Lets an OWNER add a person (staff, contractor or another owner). It
// creates their login and emails them an invite link, where they set their
// own password. Creating logins needs the service key, which never leaves
// Supabase; everything else runs as the owner, so the database's own rules
// (only owners can add people) still apply.
//
// POST { email, full_name, role: 'owner' | 'staff' | 'contractor', phone?, redirect_to? }
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'POST only' })

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const auth = req.headers.get('Authorization') ?? ''

  // The caller, with their own permissions.
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: auth } } })
  const { data: me } = await asCaller.auth.getUser()
  if (!me.user) return reply(401, { error: 'Sign in first.' })
  const { data: myProfile } = await asCaller.from('profiles').select('role, active').eq('user_id', me.user.id).maybeSingle()
  if (myProfile?.role !== 'owner' || !myProfile.active) return reply(403, { error: 'Only an owner can add people.' })

  let body: { email?: string; full_name?: string; role?: string; phone?: string; redirect_to?: string }
  try { body = await req.json() } catch { return reply(400, { error: 'Bad request.' }) }
  const email = (body.email ?? '').trim().toLowerCase()
  const fullName = (body.full_name ?? '').trim()
  const role = body.role ?? ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(400, { error: 'That email address looks wrong.' })
  if (!fullName) return reply(400, { error: 'Give their name.' })
  if (!['owner', 'staff', 'contractor'].includes(role)) return reply(400, { error: 'Choose owner, staff or contractor.' })

  // Create the login and send the invite (or find the login if it exists).
  const admin = createClient(url, service, { auth: { persistSession: false } })
  let userId: string | null = null
  let invited = false
  const inv = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: body.redirect_to || undefined,
    data: { needs_password: true, full_name: fullName },
  })
  if (inv.data?.user) {
    userId = inv.data.user.id
    invited = true
  } else {
    // Already has a login: find it.
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      const found = data?.users.find((u) => u.email?.toLowerCase() === email)
      if (found) userId = found.id
      if (!data || data.users.length < 200) break
    }
    if (!userId) return reply(400, { error: inv.error?.message ?? "Couldn't create the login." })
  }

  // Their profile, written as the owner (the database checks it's an owner).
  const { error } = await asCaller.from('profiles').upsert(
    { user_id: userId, full_name: fullName, role, phone: body.phone?.trim() || null, active: true },
    { onConflict: 'user_id' },
  )
  if (error) return reply(400, { error: error.message })
  return reply(200, { user_id: userId, invited })
})
