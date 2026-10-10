// Builds the records for the app's built-in demo (Yarrabee Downs, made up).
//
// Loads the migrations and the demo seed into a scratch database, so the
// demo's records are exactly what the real database would hold (its rules,
// defaults and worked-out values), then saves them for the app:
//   app/src/demo/demoData.json
// The app shifts every date in it forward to today when the demo opens.
//
// Usage (from the farm-records-v2 folder): node scripts/build-demo-data.mjs
import { PGlite } from '@electric-sql/pglite'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (...p) => readFileSync(join(root, ...p), 'utf8')

const OWNER = 'd0000000-0000-4000-8000-0000000001a1'
const PEOPLE = [
  [OWNER, 'owner@demo.invalid', 'Alex Demo', '0400 000 010', 'owner', null],
  ['d0000000-0000-4000-8000-0000000001a2', 'staff@demo.invalid', 'Sam Demo', '0400 000 000', 'staff', null],
  ['d0000000-0000-4000-8000-0000000001a3', 'contractor@demo.invalid', 'Chris Ridge', '0400 000 001', 'contractor', 'd0000000-0000-4000-8000-000000000121'],
]

const db = new PGlite()
await db.exec("set timezone = 'UTC'")
await db.exec(read('test', 'supabase-shim.sql'))
for (const f of readdirSync(join(root, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(read('supabase', 'migrations', f))
}

const claim = (user) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])

// The demo seed, entered as the demo owner (so "recorded by" is filled in).
for (const [id, email] of PEOPLE) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
await db.query('insert into public.profiles (user_id, full_name, phone, role) values ($1, $2, $3, $4)', [PEOPLE[0][0], PEOPLE[0][2], PEOPLE[0][3], PEOPLE[0][4]])
await claim(OWNER)
await db.exec(read('supabase', 'seed', 'demo.sql'))
for (const [id, , name, phone, role, contact] of PEOPLE.slice(1)) {
  await db.query('insert into public.profiles (user_id, full_name, phone, role, contact_id) values ($1, $2, $3, $4, $5)', [id, name, phone, role, contact])
}
await db.exec(read('supabase', 'seed', 'demo-job.sql'))
// The owner's own Home layout: everything a demo should show.
await db.query("insert into public.user_preferences (id, prefs) values ($1, '{}')", [OWNER])

// Read it back the way the owner's phone would (the database's rules apply).
async function asOwner(sql) {
  await claim(OWNER)
  await db.exec('set role authenticated')
  try { return (await db.query(sql)).rows.map((r) => r.r) } finally { await db.exec('reset role') }
}
const tables = [...read('app', 'src', 'lib', 'sync.ts').matchAll(/\{ name: '(\w+)'/g)].map((m) => m[1])
const out = { builtOn: (await db.query('select current_date::text as d')).rows[0].d, userId: OWNER, tables: {}, views: {} }
for (const t of tables) out.tables[t] = await asOwner(`select row_to_json(t) as r from public.${t} t`)
for (const v of ['farm_modules', 'paddocks_with_stock']) out.views[v] = await asOwner(`select row_to_json(t) as r from public.${v} t`)

mkdirSync(join(root, 'app', 'src', 'demo'), { recursive: true })
writeFileSync(join(root, 'app', 'src', 'demo', 'demoData.json'), JSON.stringify(out))
const counts = Object.entries(out.tables).filter(([, r]) => r.length).map(([t, r]) => `${t} ${r.length}`)
console.log(`Demo records saved (built ${out.builtOn}): ${counts.join(', ')}`)
