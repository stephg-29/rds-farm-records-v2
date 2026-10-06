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

Done so far (Phase 1 start): project set up, per-farm config, Supabase connection, sign-in screen, and a signed-in check that reads the farm name, tier and modules.
