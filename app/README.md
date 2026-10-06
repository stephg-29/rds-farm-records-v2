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
- A bar at the bottom of every screen: Home, Stock, Paddocks, Setup.

Phase 2 so far (Stock):

- Stock list grouped by property and paddock, with on-hand totals by species and any recounts due.
- Add a mob: a starting count for stock already on the farm, or an arrival (bought or agisted in, with NVD).
- A mob's page: head, paddock and days there, class mix, and a history of every record. Any record can be corrected (date, notes) or deleted; deleting a move also deletes the count adjustment recorded with it.
- Move: choose a paddock (shows other mobs already there; they stay separate), count through the gate (defaults to the book count). If the count differs: recount later (keeps the book, raises a reminder) or accept it and say why: dead found (a death record), boxed with another mob (a transfer between the two mobs), missing, strays, earlier miscount, don't know. Moving to another property asks for the NVD.
- Count: the same, without moving. Any new count closes an earlier recount.
- Move all: the stock list groups mobs under their paddock, and a paddock with more than one mob has a Move all button (also on a mob's page when it shares a paddock). Untick any mob staying behind, count each mob, pick the paddock once. Each mob gets its own move record and count; it all saves as one action.
- Head counts and paddocks are worked out on the phone from the records (src/lib/stock.ts), the same way as the database views.

Phase 2 (continued):

- Chemicals (Records, Chemicals): products with label WHP/ESI and chemical group, batches with expiry, received (owners can add the cost), write-offs with a reason, stocktakes, and a ledger per batch. On hand is worked out on the phone (src/lib/chem.ts) the same way as the database.
- Treatments: the LPA treatment record with several products per treatment, from a batch or not from the shed, or a product typed in. WHP/ESI fill from the label and show the date stock are under withhold until. Drench rotation hint for the same chemical group. Treatments can be corrected or deleted (withholds and chemical stock follow).
- Withholds are worked out on the phone (src/lib/withholds.ts), including through splits, merges and transfers, the same way as the database view. Mob pages say Clear to sell or Under withhold; the stock list badges mobs under withhold.
- Split (with the withhold choice when under withhold), merge (one record per mob merged in, so each withhold choice is kept), merge when moving into an occupied paddock, sold or left (warns and asks for a reason inside a withhold; buyer, NVD, NLIS, carrier, weight and owner-only price), deaths, and adding stock to a mob.
- Home: alerts from the database (e.g. a sale inside a withhold) with Mark resolved, mobs under withhold, and Coming up (withholds ending, recounts, NLIS to do, chemicals expiring or below zero).
- Bottom bar: Home, Stock, Records, More.

Phase 3:

- Map (Leaflet): NSW Spatial Services imagery by default (a farm elsewhere sets imageryUrl / imageryAttribution in config.js). Paddock boundaries, mobs on their paddocks, electric fences coloured by energiser unit, other fences and gates, troughs/tanks/pipes, open issues, spray withholds (from Phase 4), my location. Layer choices remembered per phone. Drawing and reshaping with Leaflet-Geoman; areas worked out from boundaries (src/lib/geo.ts). Tap a mob then a paddock to move it. Set start view per property. Offline tile download waits on the imagery licence.
- Issues: GPS, paddock and nearest feature filled in, draggable pin, categories, camera photos (shrunk to 1600 px), notes; New / Being fixed / Done.
- Photos and files: kept on the phone (IndexedDB) and uploaded to the private Storage bucket before their record syncs.
- People (owners): invite staff, contractors or owners through the invite-user Edge Function; change role or stop access. Choose-a-password after an invite, and Forgot password.
- Contractor jobs: owners set paddocks, dates and instructions, with a warning for stock in job paddocks. Contractors get their own small app showing only their open jobs and the job paddocks on the map.

The step-by-step test list is in ../CHECKLIST.md.

In development only, setting localStorage fr-simulate-offline to 1 makes the app behave as if there is no signal, for testing offline use without touching the farm's database. It is stripped from the built app.
- Changes the database turns down are listed with the reason (tap the red sync line). Editing the record again retries it; it can also be dropped.

## Tests

```bash
npx vitest run
```

The sync engine is tested against a pretend server (no network needed): offline saves, order, lost replies, repeated edits, two phones editing the same copy, deletes, duplicates, changes the server turns down and fixing them. The module rules are tested against the same cases the database checks.
