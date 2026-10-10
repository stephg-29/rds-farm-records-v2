# The demo farm

**Yarrabee Downs** is a made-up farm for sales demos, screenshots and training. It has about 500 ha in 12 paddocks east of Armidale NSW, with Merino sheep and Angus cattle. Every name, PIC and number in it is invented.

The demo runs the real app on records kept only in the browser. There is no login, and nothing is sent to any database. A bar across the top says it's the demo and lets you:

- **View as** Owner, Staff or Contractor, to see each person's app.
- **Reset demo** to start again from the original records.
- ✕ to hide the bar, for example for screenshots. A small "Demo" button brings it back.

Dates move forward on their own, so the demo always looks current. It always shows a mob under withhold, a part-treated mob, a sprayed paddock, a part-done contractor spray, a gate left open, feed running down and a service due.

## Putting it online

1. Make a new Netlify site for the demo, e.g. `farm-records-demo`.
2. Build it from the farm-records-v2 folder:
   `node scripts/build-farm.mjs ../demo-config.js` creates `deploy/demo/`.
3. Drag `deploy/demo` onto the demo site (Deploys).
4. Add the demo site's address to the Esri key's allowed referrers, or the map imagery won't load there.

`demo-config.js` lives beside the farm-records-v2 folder, not in git. It is just `window.FARM_CONFIG = { demo: true, esriApiKey: '...' }`.

## Changing the demo records

- The records come from `supabase/seed/demo.sql` and `supabase/seed/demo-job.sql`.
- After changing either one, run `node scripts/build-demo-data.mjs`. It loads them into a scratch database, so the database's own rules check them, then saves `app/src/demo/demoData.json`.
- `npm test` checks the seed too (`test/99-demo-seed.test.mjs`).
- On a development machine, setting `localStorage['fr-demo'] = '1'` opens the demo instead of the farm in config.js.
