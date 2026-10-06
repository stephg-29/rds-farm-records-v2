// Checks scripts/apply-migrations.mjs against a throwaway local database
// (PGlite over a socket): the dry run connects, lists what is missing and
// changes nothing. The local socket server drops the connection on a full
// migration file, so --apply is checked on its first real use against a
// Supabase project instead (see CHECKLIST.md, Phase 5).
// Run: node test/apply-migrations.check.mjs
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const db = await PGlite.create()
await db.exec(readFileSync(join(here, 'supabase-shim.sql'), 'utf8'))
const server = new PGLiteSocketServer({ db, port: 55432 })
await server.start()
const env = { ...process.env, DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/postgres', PGSSLMODE: 'disable' }
// Async, so this process's test database can answer while the script runs.
const run = async (args) => (await promisify(execFile)(process.execPath, [join(here, '..', 'scripts', 'apply-migrations.mjs'), ...args], { env, encoding: 'utf8' })).stdout

let ok = true
const check = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) ok = false }
try {
  const dry = await run([])
  check(/Database has 0 of \d+ migrations/.test(dry) && /Nothing changed/.test(dry), 'dry run on an empty database lists everything and changes nothing')
  check((await db.query(`select to_regclass('public.mobs') as t`)).rows[0].t === null, 'dry run created no tables')
} catch (err) {
  ok = false
  console.error('  FAIL ', err.stdout ?? '', err.stderr ?? err.message)
} finally {
  await server.stop()
  await db.close()
}
process.exit(ok ? 0 : 1)
