// Bring a farm's database up to date: applies the migrations it doesn't have
// yet, in order, each in its own transaction (all of a migration, or none).
//
// Usage (from the farm-records-v2 folder):
//   DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres" \
//     node scripts/apply-migrations.mjs            # show what would be applied
//   ... node scripts/apply-migrations.mjs --apply    # apply it
//
// The connection string is in the client's Supabase project: Connect,
// Session pooler. It holds the database password: never commit it or put it
// in config.js. Paste it into the terminal for this one run only.
import pg from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')
const apply = process.argv.includes('--apply')
const url = process.env.DATABASE_URL
if (!url) {
  console.error('Set DATABASE_URL to the farm\'s Session pooler connection string first (see the top of this file).')
  process.exit(1)
}

// PGSSLMODE=disable is only for testing against a local database.
const client = new pg.Client({ connectionString: url, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false } })
await client.connect()
try {
  const exists = (await client.query(`select to_regclass('public.schema_migrations') is not null as ok`)).rows[0].ok
  const done = new Set(exists ? (await client.query('select version from public.schema_migrations')).rows.map((r) => r.version) : [])
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const todo = files.filter((f) => !done.has(f.replace(/\.sql$/, '')))

  console.log(`Database has ${done.size} of ${files.length} migrations.`)
  if (todo.length === 0) { console.log('Up to date.'); process.exit(0) }
  for (const f of todo) console.log(`  to apply: ${f}`)
  if (!apply) { console.log('\nNothing changed. Run again with --apply to apply these.'); process.exit(0) }

  for (const f of todo) {
    process.stdout.write(`applying ${f} ... `)
    try {
      await client.query('begin')
      await client.query(readFileSync(join(dir, f), 'utf8'))
      await client.query('commit')
      console.log('done')
    } catch (err) {
      await client.query('rollback')
      console.log('FAILED (nothing from this migration was kept)')
      console.error(err.message)
      process.exit(1)
    }
  }
  console.log('\nUp to date. Now run the Supabase security and performance advisors (Dashboard, Advisors).')
} finally {
  await client.end()
}
