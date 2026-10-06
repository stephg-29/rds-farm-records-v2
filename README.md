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
