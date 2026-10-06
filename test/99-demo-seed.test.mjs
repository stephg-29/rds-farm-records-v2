// The demo farm seed (supabase/seed/demo.sql) loads cleanly and gives the
// demo what it's meant to show.
import { readFileSync } from 'node:fs';

export default async function ({ as, test, expect, exec, users }) {
  const { OWNER } = users;
  await test('the demo farm seed loads', async () => {
    await exec(readFileSync(new URL('../supabase/seed/demo.sql', import.meta.url), 'utf8'));
  });

  await test('demo mobs have their head counts and paddocks', async () => {
    const r = await as(OWNER, `select m.name, t.head, p.name as paddock from public.mob_totals t join public.mobs m on m.id = t.mob_id
                               left join public.mob_current_location l on l.mob_id = m.id left join public.paddocks p on p.id = l.paddock_id
                               where m.id::text like 'd0000000-%' order by m.name`);
    const got = r.rows.map((x) => `${x.name} ${x.head} ${x.paddock}`).join(', ');
    expect(got === 'Angus bulls 3 House paddock, Merino ewes 420 Lease front, River cows 112 River flat, Weaner steers 64 Back gully, Yellow tag heifers 50 Middle', got);
  });

  await test('demo shows a mob under withhold and a paddock under spray withhold', async () => {
    const w = await as(OWNER, `select count(*)::int as n from public.active_withholds where mob_id = 'd0000000-0000-4000-8000-0000000000b2'`);
    const s = await as(OWNER, `select count(*)::int as n from public.paddock_grazing_withholds where paddock_id = 'd0000000-0000-4000-8000-0000000000a3'`);
    expect(w.rows[0].n === 1 && s.rows[0].n === 1, `withholds ${w.rows[0].n}, spray ${s.rows[0].n}`);
  });

  await test('demo chemical stock and feed add up', async () => {
    const c = await as(OWNER, `select on_hand::float as q from public.chemical_on_hand where batch_id = 'd0000000-0000-4000-8000-0000000000d1'`);
    const f = await as(OWNER, `select days_left from public.feed_days_remaining where feed_item_id = 'd0000000-0000-4000-8000-000000000102'`);
    // 5 L - 0.4 L - 1.79 L; 120 bales x 400 kg / (112 cows x 6 kg)
    expect(Math.abs(c.rows[0].q - 2.81) < 0.001 && f.rows[0].days_left === 71, `cydectin ${c.rows[0].q}, feed days ${f.rows[0].days_left}`);
  });

  await test('demo reminders include a service, document reviews and calving', async () => {
    const r = await as(OWNER, `select distinct kind from public.reminders`);
    const kinds = r.rows.map((x) => x.kind);
    expect(['vehicle_service_due', 'document_review', 'births_due'].every((k) => kinds.includes(k)), kinds.join(', '));
  });
}
