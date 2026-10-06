# Setting up a farm, and rolling out updates (RDS)

Each farm gets its own Supabase project in **the client's own Supabase account** (they own their data and the bill), and its own Netlify site. The app build is the same for every farm; only `config.js` differs.

## 1. Supabase project (with the client)

1. The client makes a Supabase account (or you make it with them) and creates an organisation in their name.
2. New project: name `<Farm> Farm Records`, region **Sydney**, a strong database password (the client keeps it; you need it once, in step 2). Free plan to start.
3. Project Settings, API keys: note the **Project URL** and the **publishable key** (`sb_publishable_...`). Never use or copy the secret / service-role key.

## 2. Database

From the `farm-records-v2` folder, with the project's **Session pooler** connection string (Connect, Session pooler):

```bash
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres" node scripts/apply-migrations.mjs
```

That only lists what it would do. Run it again with `--apply` at the end to apply. Afterwards: Dashboard, Advisors, run Security and Performance; both should be clear.

(Alternative without the script: paste each file in `supabase/migrations` into the SQL editor, in order.)

## 3. The invite-user function

Needed for owners to add staff and contractors. With the Supabase CLI:

```bash
npx supabase functions deploy invite-user --project-ref <ref>
```

(Or Dashboard, Edge Functions, Deploy a new function, name `invite-user`, paste `supabase/functions/invite-user/index.ts`. Leave "Verify JWT" on.)

## 4. Sign-in settings

Authentication, URL Configuration:
- Site URL: the farm's Netlify address (step 6), e.g. `https://kooringa-farm-records.netlify.app`
- Redirect URLs: add the same address.

Authentication, Emails: the built-in email only sends a few an hour. For a farm with several staff, set up custom SMTP (e.g. the client's email provider) under Authentication, SMTP.

## 5. The owner's login

Authentication, Users, Add user (the owner's email; they choose a password, or send them a reset). Then in the SQL editor:

```sql
insert into public.profiles (user_id, full_name, phone, role)
select id, 'Owner Name', '04xx xxx xxx', 'owner' from auth.users where email = 'owner@example.com';
update public.farm_settings set farm_name = 'Kooringa Pastoral';
-- Tier (only RDS can change it): 1 mob-based, 2 adds individual animals.
update public.farm_settings set tier = 1;
```

The owner adds everyone else from the app (More, People).

## 6. The app

1. Make the farm's `config.js` (copy `app/public/config.example.js`), with the Project URL and publishable key. Keep it somewhere private, not in this repo, e.g. `clients/kooringa-config.js`.
   - A farm outside NSW: add `imageryUrl` and `imageryAttribution` for that state's imagery once its licence is checked.
2. `node scripts/build-farm.mjs clients/kooringa-config.js` builds `deploy/kooringa/`. It refuses a config with a secret key in it.
3. Netlify: Add new site, Deploy manually, drag `deploy/kooringa/` in. Rename the site (e.g. `kooringa-farm-records`). Use that address in step 4.
4. On each phone: open the address, sign in, then Add to Home Screen (iPhone: Share, Add to Home Screen; Android: the install prompt or menu, Install app). It then opens with no signal.

## 7. Bringing in their records

More, Import records (owner): Farm Records v1 sheets (each tab as CSV) and the Fence Map's `data.js`. Preview first; any import can be undone from the same screen. v1 stock movements come in as history only; enter each mob with a starting count.

## Rolling out updates

**App:** run `scripts/build-farm.mjs` for each farm and drag each folder onto its Netlify site. Phones show "A new version of Farm Records is ready" and update when the person taps Update (nothing half-entered is lost). More, About shows the app version.

**Database:** when a release adds a migration, run `scripts/apply-migrations.mjs` (dry run, then `--apply`) against each farm **before** deploying the app that needs it. More, About shows the farm's database version and warns if it's behind what the app needs (`REQUIRED_MIGRATION` in `app/src/screens/About.tsx`; bump it when the app starts relying on a new migration).

Migrations only ever add (new tables, columns, rules); they never drop a farm's data.

## Demo farm

For demos and training, a separate Supabase project with the migrations plus `supabase/seed/demo.sql` (Kooringa Pastoral, made up). The seed file's header says how to add the demo login. Never run it on a client's project.
