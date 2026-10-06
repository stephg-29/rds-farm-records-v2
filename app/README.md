# Farm Records v2 app

The phone app for Farm Records v2. React, TypeScript and Tailwind, built with Vite into plain files that any static host (Netlify) can serve. The database it talks to is in `../supabase`.

## Run it on this computer

```bash
npm install
npm run dev
```

## Connecting it to a farm

The app reads the farm's Supabase address and publishable key from `public/config.js`, which is loaded before the app starts. Each farm gets its own `config.js`; the app build is the same for every farm.

1. Copy `public/config.example.js` to `public/config.js`.
2. Fill in the farm's Supabase project URL and its **publishable** key (`sb_publishable_...`). Never the secret or service-role key.
3. `config.js` is in `.gitignore`, so a farm's details are never committed.

On Netlify, deploy the `dist` folder from `npm run build`, then upload that farm's `config.js` alongside it.

## Build plan

| Phase | What |
|---|---|
| 1. Foundation | Login, offline storage and sync, setup (farm, properties, paddocks, lists, module ticks), Home |
| 2. Livestock | Mobs, moves, splits, merges, counts, arrivals and exits, treatments, chemical inventory, withhold warnings and alerts, history |
| 3. Map | Map, layers, issues, contractor jobs |
| 4. Everything else | Spray, pasture, feed, breeding, vehicles, documents, rainfall, LPA audit pack, reconciliation |
| 5. Ready to sell | Imports, update tooling, demo farm, handover doc |

Done so far (Phase 1):

- Project set up, per-farm config, Supabase connection, sign-in.
- Offline storage and sync (`src/lib/db.ts`, `sync.ts`, `remote.ts`, `useSync.tsx`). Every save goes to the phone first and an outbox, then sends when there is signal; screens read the phone copy so they work with no signal. Edits always save; an edit made from an out-of-date copy is flagged by the database. Changes the server turns down are kept with the reason. Sign-out waits until nothing is unsent.
- Setup screens: farm name and tier, properties (PIC, owned or leased, address, notes) with their paddocks (area in ha), the dropdown lists (add, rename, reorder, archive, restore), livestock classes by species, and module ticks (owner only; locked tiers and module dependencies checked on the phone and again by the database). Nothing is deleted: properties, paddocks and list items are archived and can be restored. Duplicates are caught before saving.
- Home shows the farm, tier, sync status, a prompt to add properties, shortcuts to paddocks and setup, and an "On the way" list of the switched-on modules with the phase each arrives in.
- A bar at the bottom of every screen: Home, Paddocks, Setup.
- Changes the database turns down are listed with the reason (tap the red sync line). Editing the record again retries it; it can also be dropped.

## Tests

```bash
npx vitest run
```

The sync engine is tested against a pretend server (no network needed): offline saves, order, lost replies, repeated edits, two phones editing the same copy, deletes, duplicates, changes the server turns down and fixing them. The module rules are tested against the same cases the database checks.
