// Build the app for one farm: the same build for everyone, with that farm's
// config.js put in. The result is a folder to drag onto the farm's Netlify site.
//
// Usage (from the farm-records-v2 folder):
//   node scripts/build-farm.mjs path/to/kooringa-config.js
//   -> deploy/kooringa/   (drag this folder onto Netlify, Deploys)
//
// Keep each farm's config.js somewhere private (not in this repo). It holds
// only the project URL and the publishable key; this script refuses one that
// contains a secret or service-role key.
import { execSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const configPath = process.argv[2]
if (!configPath || !existsSync(configPath)) {
  console.error('Give the path to the farm\'s config.js, e.g. node scripts/build-farm.mjs ../clients/kooringa-config.js')
  process.exit(1)
}
const config = readFileSync(configPath, 'utf8')

// Never ship a key that bypasses the database's rules.
if (/sb_secret_|service_role|SUPABASE_SERVICE/i.test(config)) {
  console.error('That config.js contains a secret or service-role key. Use the publishable key (sb_publishable_...) only.')
  process.exit(1)
}
for (const jwt of config.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g) ?? []) {
  try {
    const role = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role
    if (role && role !== 'anon') { console.error(`That config.js contains a "${role}" key. Use the publishable (anon) key only.`); process.exit(1) }
  } catch { /* not a JWT */ }
}
if (!/supabaseUrl\s*:\s*['"]https:\/\/[a-z0-9]+\.supabase\.co['"]/.test(config)) {
  console.error('That config.js has no supabaseUrl like https://<project-ref>.supabase.co.')
  process.exit(1)
}

const farm = basename(configPath).replace(/[-_]?config\.js$/i, '').replace(/\.js$/, '') || 'farm'
const out = resolve(root, 'deploy', farm)

console.log('Building the app ...')
execSync('npm run build', { cwd: join(root, 'app'), stdio: 'inherit' })
rmSync(out, { recursive: true, force: true })
cpSync(join(root, 'app', 'dist'), out, { recursive: true })
writeFileSync(join(out, 'config.js'), config)
rmSync(join(out, 'config.example.js'), { force: true })
// Netlify: any address opens the app (it uses # addresses, but be safe).
writeFileSync(join(out, '_redirects'), '/*  /index.html  200\n')
console.log(`\nReady: ${out}\nDrag that folder onto the farm's Netlify site (Deploys). Phones pick up the new version and offer "Update".`)
