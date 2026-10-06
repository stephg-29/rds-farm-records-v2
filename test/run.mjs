// Builds a fresh test database from the migrations and runs the tests.
// Usage: npm test
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'supabase', 'migrations');

const db = new PGlite();

await db.exec(readFileSync(join(here, 'supabase-shim.sql'), 'utf8'));

for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    console.log(`applied  ${file}`);
  } catch (err) {
    console.error(`FAILED   ${file}\n${err.message}`);
    process.exit(1);
  }
}

// ---- helpers ------------------------------------------------------------

// Run SQL as a logged-in user (row-level security applies), or as the
// database owner when user is null (setup only).
async function as(user, sql, params = []) {
  await db.exec('reset role');
  if (user) {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    await db.exec('set role authenticated');
  } else {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

async function fails(user, sql, params = []) {
  try {
    await as(user, sql, params);
    return null;
  } catch (err) {
    return err.message;
  }
}

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}
function expect(cond, message) {
  if (!cond) throw new Error(message);
}

// ---- test users ---------------------------------------------------------

const OWNER = '00000000-0000-0000-0000-000000000001';
const STAFF = '00000000-0000-0000-0000-000000000002';
const CONTRACTOR = '00000000-0000-0000-0000-000000000003';

await db.exec(`
  insert into auth.users (id, email) values
    ('${OWNER}', 'owner@test'), ('${STAFF}', 'staff@test'), ('${CONTRACTOR}', 'dave@test');
  insert into public.profiles (user_id, full_name, role) values
    ('${OWNER}', 'Olive Owner', 'owner'),
    ('${STAFF}', 'Sue Staff', 'staff'),
    ('${CONTRACTOR}', 'Dave Contractor', 'contractor');
`);

const ctx = { as, fails, test, expect, users: { OWNER, STAFF, CONTRACTOR } };

// ---- tests --------------------------------------------------------------

const testFiles = readdirSync(here).filter((f) => f.endsWith('.test.mjs')).sort();
for (const file of testFiles) {
  console.log(`\n${file}`);
  const mod = await import(`./${file}`);
  try {
    await mod.default(ctx);
  } catch (err) {
    failed++;
    console.log(`  FAIL  test setup: ${err.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
