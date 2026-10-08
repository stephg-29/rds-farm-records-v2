// Part-treated mobs and paddocks joined by an open gate.
export default async function ({ as, test, expect, users }) {
  const { OWNER, STAFF, CONTRACTOR } = users;
  const id = (n) => `70000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const PROP = id(1), FRONT = id(2), BACK = id(3), CREEK = id(4), MOB = id(10), EV = id(11), CLASS = id(12);
  await as(OWNER, `insert into public.properties (id, name) values ($1, 'Gate test')`, [PROP]);
  await as(OWNER, `insert into public.paddocks (id, property_id, name) values ($1, $4, 'Front'), ($2, $4, 'Back'), ($3, $4, 'Creek')`, [FRONT, BACK, CREEK, PROP]);
  await as(OWNER, `insert into public.livestock_classes (id, species, name) values ($1, 'cattle', 'Gate test class')`, [CLASS]);
  await as(OWNER, `insert into public.mobs (id, name, species) values ($1, 'Gate heifers', 'cattle')`, [MOB]);
  await as(OWNER, `insert into public.stock_events (id, event_date, event_type) values ($1, current_date - 10, 'arrival')`, [EV]);
  await as(OWNER, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change) values ($1, $2, $3, 20)`, [EV, MOB, CLASS]);
  await as(OWNER, `insert into public.mob_location_changes (stock_event_id, mob_id, property_id, paddock_id) values ($1, $2, $3, $4)`, [EV, MOB, PROP, FRONT]);

  await test('a part treatment keeps how many were in the mob; the rest points back to it', async () => {
    const T1 = id(20), T2 = id(21);
    await as(STAFF, `insert into public.treatments (id, treatment_date, mob_id, head_treated, mob_head) values ($1, current_date, $2, 18, 20)`, [T1, MOB]);
    await as(STAFF, `insert into public.treatments (id, treatment_date, mob_id, head_treated, follow_up_of) values ($1, current_date, $2, 2, $3)`, [T2, MOB, T1]);
    const r = await as(OWNER, `select t.mob_head, t.head_treated, (select sum(head_treated) from public.treatments f where f.follow_up_of = t.id)::int as rest from public.treatments t where t.id = $1`, [T1]);
    expect(r.rows[0].mob_head === 20 && r.rows[0].head_treated === 18 && r.rows[0].rest === 2, JSON.stringify(r.rows));
  });

  await test('an open gate: the joined paddock counts as having stock; closing it stops that', async () => {
    const J = id(30);
    const before = await as(STAFF, `select paddock_id from public.paddocks_with_stock where paddock_id in ($1, $2, $3)`, [FRONT, BACK, CREEK]);
    await as(STAFF, `insert into public.paddock_joins (id, property_id, paddock_ids) values ($1, $2, array[$3, $4]::uuid[])`, [J, PROP, FRONT, BACK]);
    const open = await as(STAFF, `select paddock_id from public.paddocks_with_stock where paddock_id in ($1, $2, $3)`, [FRONT, BACK, CREEK]);
    await as(STAFF, `update public.paddock_joins set closed_on = current_date where id = $1`, [J]);
    const closed = await as(STAFF, `select paddock_id from public.paddocks_with_stock where paddock_id in ($1, $2, $3)`, [FRONT, BACK, CREEK]);
    const ids = (r) => r.rows.map((x) => x.paddock_id).sort().join();
    expect(ids(before) === FRONT && ids(open) === [FRONT, BACK].sort().join() && ids(closed) === FRONT, `${ids(before)} | ${ids(open)} | ${ids(closed)}`);
  });

  await test('a join needs at least two paddocks, and contractors cannot see joins', async () => {
    let refused = false;
    try { await as(STAFF, `insert into public.paddock_joins (property_id, paddock_ids) values ($1, array[$2]::uuid[])`, [PROP, FRONT]); } catch { refused = true; }
    const c = await as(CONTRACTOR, `select count(*)::int as n from public.paddock_joins`);
    expect(refused && c.rows[0].n === 0, `refused ${refused}, contractor sees ${c.rows[0].n}`);
  });
}
