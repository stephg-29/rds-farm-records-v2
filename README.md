# RDS Farm Records v2

The database for Farm Records v2: one Supabase (Postgres) database per client, built from the same migration files every time.

- `SCHEMA.md`: what every table is for, in plain English first. Read this before changing anything.
- `supabase/migrations/`: the database build, in order. Never edit a migration that has already been applied to a client database. Add a new numbered file instead.
- `test/`: builds a fresh test database from the migrations and checks the rules.

## Run the tests

```bash
npm install
npm test
```

The tests use PGlite (Postgres running inside Node), so nothing else needs installing. `test/supabase-shim.sql` stands in for the parts Supabase provides (logins and roles). Never run the shim on a real Supabase project.

## The migrations

| File | What it builds |
|---|---|
| 0001_foundation | Settings, logins and roles, contacts, properties, paddocks, pick lists, livestock classes, files, owner-only prices, change log, alerts, imports |
| 0002_livestock | Mobs, stock events, count lines, mob locations, Tier 2 animals; head count and location views |
| 0003_chemicals_treatments | Products, batches, chemical ledger, LPA treatment records, withholds, the sale/slaughter withhold check |
| 0004_breeding | Joinings, pregnancy tests, marking counts |
| 0005_land_and_jobs | Spray, pasture and fertiliser records, contractor jobs and contractor access |
| 0006_feed | Feed storage, lots, ledger, rations, feeding events, medicated feed withholds, days of feed left |
| 0007_map_vehicles_documents | Map features, issues, readings, vehicles and services, documents |
| 0008_defaults_and_reports | Default lists and classes, reminders, livestock reconciliation, history views, LPA registers |
| 0009_pin_search_path | Security hardening from the Supabase advisor: fixes the search_path of every helper function |
| 0010_performance | Indexes for every foreign key, and per-query (not per-row) user checks in policies |
| 0011_tiers_and_modules | Tier lock, module catalogue, the owner's module ticks, and the `farm_modules` view the app builds its menus from |
| 0012_edit_conflict_fix | Flags the second of two phones that edited the same copy offline (0001 missed it when both phones sent their copy's time) |
| 0013_recounted | Lets a later count close a "recount later" reminder |
| 0014_attachment_storage | Private Storage bucket for photos and files, owners and staff only |

## Tiers and modules

- **Changing a farm's tier is RDS only.** Run in that client's Supabase SQL editor: `update public.farm_settings set tier = 2;` Anyone logged in to the app (owners included) is refused. An upgrade switches on the modules it unlocks, and the change is logged in `change_log`.
- **Owners choose modules** in the app's setup screen (`farm_settings.enabled_modules`). Unticking only hides a module; nothing is deleted. Modules above the tier show as `locked`. Stock and paddocks are always on. Contractor jobs need Spray or Pasture.
- The app reads `farm_modules` (status `core`, `on`, `off` or `locked`, plus `visible`) to decide what to show.
- The tier lock stops changes from inside the app. A client who owns their Supabase project could still change it in their own dashboard, so the licence agreement is what makes the tier binding.

After applying migrations to any database, run the Supabase security and performance advisors. If a later migration adds helper functions or tables, re-run the loops in 0009 and 0010 (they are safe to repeat).

## Live databases

| Database | Supabase project | Notes |
|---|---|---|
| Steph's own farm (reference build) | `RDS-Farm-Records-v2` (ref `kounhfnrxbfkjdwbfmxv`), RDS organisation, Sydney | Free plan. Migrations 0001 to 0014 applied, plus the invite-user Edge Function 6 Oct 2026. Tier 1, farm name "The Block", Steph is owner. Kept separate from RDS-Portal (the CRM). |

## Rules the database enforces

- Everything can be edited. Every earlier version is kept in `change_log`.
- Nothing is ever really deleted: "delete" sets `deleted_at`, and a restore clears it.
- Head counts, locations, stock on hand and withholds are always worked out from records, never typed in.
- Prices live only in `record_prices`, which only the owner role can read or write.
- Contractors see only the paddocks in their open jobs, and can only record spray or pasture work for those jobs.
- A sale or slaughter inside a withhold is kept, flagged `needs_review`, and sends an urgent alert to every owner and to the person who recorded it, even when the treatment syncs after the sale.

## Setting up a new client database

1. The client creates a Supabase account and project in their own name, and adds Steph as a member.
2. Apply every file in `supabase/migrations/` in order (Supabase CLI `supabase db push`, or the SQL editor).
3. Create the first owner: add the person in Authentication, then run (as the project owner, in the SQL editor):
   ```sql
   insert into public.profiles (user_id, full_name, phone, role)
   values ('<their auth user id>', '<name>', '<phone>', 'owner');
   ```
   Every later login is added by an owner from inside the app.
4. Set the farm name and tier in `farm_settings`.
5. Check `select * from schema_migrations order by version;` lists every migration.

## Edge Functions

| Function | What it does |
|---|---|
| invite-user | Owners add a person: creates their login, emails an invite (they set their own password), and writes their profile as the owner. The service key stays in Supabase. Deploy to each client's project. |
