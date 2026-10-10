// The demo farm seed (supabase/seed/demo.sql) loads cleanly and gives the
// demo what it's meant to show.
import { readFileSync } from 'node:fs';

export default async function ({ as, test, expect, exec, users }) {
  const { OWNER } = users;
  await test('the demo farm seed loads', async () => {
    await exec(readFileSync(new URL('../supabase/seed/demo.sql', import.meta.url), 'utf8'));
  });

  await test('demo is about 500 ha', async () => {
    const r = await as(OWNER, `select sum(area_ha)::float as ha, count(*)::int as n from public.paddocks where id::text like 'd0000000-%'`);
    expect(r.rows[0].n === 12 && Math.abs(r.rows[0].ha - 500) < 5, `${r.rows[0].n} paddocks, ${r.rows[0].ha} ha`);
  });

  await test('demo mobs have their head counts and paddocks', async () => {
    const r = await as(OWNER, `select m.name, t.head, p.name as paddock from public.mob_totals t join public.mobs m on m.id = t.mob_id
                               left join public.mob_current_location l on l.mob_id = m.id left join public.paddocks p on p.id = l.paddock_id
                               where m.id::text like 'd0000000-%' and t.head > 0 order by m.name`);
    const got = r.rows.map((x) => `${x.name} ${x.head} ${x.paddock}`).join(', ');
    expect(got === 'Angus bulls 5 Bull paddock, Angus cows 160 Long paddock, Ewe lambs 450 Dam paddock, Merino ewes 1198 Ridge, Merino rams 18 Ridge, '
      + 'Merino wethers 600 Woolshed, Replacement heifers 60 House paddock, Weaner steers 85 Stringybark', got);
  });

  await test('demo shows mobs under withhold and a paddock under spray withhold', async () => {
    const w = await as(OWNER, `select count(distinct mob_id)::int as n from public.active_withholds where mob_id in ('d0000000-0000-4000-8000-0000000000b3', 'd0000000-0000-4000-8000-0000000000b7')`);
    const s = await as(OWNER, `select count(*)::int as n from public.paddock_grazing_withholds where paddock_id = 'd0000000-0000-4000-8000-0000000000aa'`);
    expect(w.rows[0].n === 2 && s.rows[0].n === 1, `withholds ${w.rows[0].n}, spray ${s.rows[0].n}`);
  });

  await test('the wethers graze both paddocks through the open gate', async () => {
    const r = await as(OWNER, `select count(*)::int as n from public.paddocks_with_stock where paddock_id in ('d0000000-0000-4000-8000-0000000000a3', 'd0000000-0000-4000-8000-0000000000a4')`);
    expect(r.rows[0].n === 2, `${r.rows[0].n}`);
  });

  await test('demo chemical stock and feed add up', async () => {
    const c = await as(OWNER, `select on_hand::float as q from public.chemical_on_hand where batch_id = 'd0000000-0000-4000-8000-0000000000d1'`);
    const f = await as(OWNER, `select days_left from public.feed_days_remaining where feed_item_id = 'd0000000-0000-4000-8000-000000000102'`);
    // 5 L - 0.4 L - 2.38 L; 140 bales x 400 kg / (160 cows x 6 kg)
    expect(Math.abs(c.rows[0].q - 2.22) < 0.001 && f.rows[0].days_left === 58, `cydectin ${c.rows[0].q}, feed days ${f.rows[0].days_left}`);
  });

  await test('a ration of whole bales to the mob every few days counts towards days left', async () => {
    await as(OWNER, `update public.rations set feed_every_days = 2 where id = 'd0000000-0000-4000-8000-000000000104'`);
    await as(OWNER, `update public.ration_items set amount_basis = 'units_per_mob', amount = 2, kg_per_head_per_day = null where ration_id = 'd0000000-0000-4000-8000-000000000104'`);
    const f = await as(OWNER, `select days_left, kg_per_day::float as kg from public.feed_days_remaining where feed_item_id = 'd0000000-0000-4000-8000-000000000102'`);
    // 2 bales x 400 kg every 2 days = 400 kg a day; 140 bales x 400 kg / 400
    expect(f.rows[0].kg === 400 && f.rows[0].days_left === 140, `kg/day ${f.rows[0].kg}, days ${f.rows[0].days_left}`);
  });

  await test('demo reminders include a service, document reviews and calving', async () => {
    const r = await as(OWNER, `select distinct kind from public.reminders`);
    const kinds = r.rows.map((x) => x.kind);
    expect(['vehicle_service_due', 'document_review', 'births_due'].every((k) => kinds.includes(k)), kinds.join(', '));
  });
}
