export default async function ({ as, fails, test, expect, users }) {
  const { OWNER, STAFF, CONTRACTOR } = users;
  const PROP = '20000000-0000-0000-0000-000000000001';
  const CREEK = '20000000-0000-0000-0000-0000000000a1';
  const MIDDLE = '20000000-0000-0000-0000-0000000000a2';
  const OTHER_PROP = '20000000-0000-0000-0000-000000000002';
  const HEIFERS = '20000000-0000-0000-0000-0000000000b1';
  const NEW_MOB = '20000000-0000-0000-0000-0000000000b2';
  const CLASS = '20000000-0000-0000-0000-0000000000c1';

  await as(STAFF, `
    insert into public.properties (id, name, pic) values ($1, 'Kooringa', 'NA123456'), ($2, 'Bimbadeen', 'NB234567')`,
    [PROP, OTHER_PROP]);
  await as(STAFF, `insert into public.paddocks (id, property_id, name) values ($1, $3, 'Creek paddock'), ($2, $3, 'Middle')`,
    [CREEK, MIDDLE, PROP]);
  await as(STAFF, `insert into public.livestock_classes (id, species, name, sex) values ($1, 'cattle', 'Test heifers', 'female')`, [CLASS]);
  await as(STAFF, `insert into public.mobs (id, name, species) values ($1, 'Yellow tag heifers', 'cattle')`, [HEIFERS]);

  const ARRIVAL = '20000000-0000-0000-0000-0000000000e1';
  await test('an arrival of 50 head gives a mob of 50 in Creek paddock', async () => {
    await as(STAFF, `insert into public.stock_events (id, event_date, event_type, to_property_id, nvd_number)
                     values ($1, '2026-09-24', 'arrival', $2, 'NVD123')`, [ARRIVAL, PROP]);
    await as(STAFF, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change) values ($1, $2, $3, 50)`,
      [ARRIVAL, HEIFERS, CLASS]);
    await as(STAFF, `insert into public.mob_location_changes (stock_event_id, mob_id, property_id, paddock_id) values ($1, $2, $3, $4)`,
      [ARRIVAL, HEIFERS, PROP, CREEK]);
    const t = await as(STAFF, `select head from public.mob_totals where mob_id = $1`, [HEIFERS]);
    const loc = await as(STAFF, `select paddock_id from public.mob_current_location where mob_id = $1`, [HEIFERS]);
    expect(t.rows[0].head === 50, `head = ${t.rows[0]?.head}`);
    expect(loc.rows[0].paddock_id === CREEK, 'mob not in Creek paddock');
  });

  const SPLIT = '20000000-0000-0000-0000-0000000000e2';
  await test('splitting 20 into a new mob in Middle leaves 30 and 20', async () => {
    await as(STAFF, `insert into public.mobs (id, name, species) values ($1, 'Heifers to join', 'cattle')`, [NEW_MOB]);
    await as(STAFF, `insert into public.stock_events (id, event_date, event_type) values ($1, '2026-10-04', 'split')`, [SPLIT]);
    await as(STAFF, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change)
                     values ($1, $2, $4, -20), ($1, $3, $4, 20)`, [SPLIT, HEIFERS, NEW_MOB, CLASS]);
    await as(STAFF, `insert into public.mob_location_changes (stock_event_id, mob_id, property_id, paddock_id) values ($1, $2, $3, $4)`,
      [SPLIT, NEW_MOB, PROP, MIDDLE]);
    const t = await as(STAFF, `select mob_id, head from public.mob_totals where mob_id in ($1, $2) order by head desc`, [HEIFERS, NEW_MOB]);
    expect(t.rows[0].head === 30 && t.rows[1].head === 20, `got ${t.rows.map((r) => r.head)}`);
    const loc = await as(STAFF, `select mob_id, paddock_id from public.mob_current_location where mob_id in ($1, $2)`, [HEIFERS, NEW_MOB]);
    const byMob = Object.fromEntries(loc.rows.map((r) => [r.mob_id, r.paddock_id]));
    expect(byMob[HEIFERS] === CREEK && byMob[NEW_MOB] === MIDDLE, 'locations wrong after split');
  });

  await test('two mobs can share a paddock', async () => {
    const MOVE = '20000000-0000-0000-0000-0000000000e3';
    await as(STAFF, `insert into public.stock_events (id, event_date, event_type, expected_head, counted_head)
                     values ($1, '2026-10-05', 'paddock_move', 30, 30)`, [MOVE]);
    await as(STAFF, `insert into public.mob_location_changes (stock_event_id, mob_id, property_id, paddock_id) values ($1, $2, $3, $4)`,
      [MOVE, HEIFERS, PROP, MIDDLE]);
    const loc = await as(STAFF, `select count(*)::int as n from public.mob_current_location where paddock_id = $1`, [MIDDLE]);
    expect(loc.rows[0].n === 2, `expected 2 mobs in Middle, got ${loc.rows[0].n}`);
  });

  await test('deleting the split puts the counts back, and it can be restored', async () => {
    await as(STAFF, `update public.stock_events set deleted_at = now(), edit_reason = 'Entered by mistake' where id = $1`, [SPLIT]);
    let t = await as(STAFF, `select head from public.mob_totals where mob_id = $1`, [HEIFERS]);
    expect(t.rows[0].head === 50, `after delete head = ${t.rows[0].head}`);
    await as(STAFF, `update public.stock_events set deleted_at = null where id = $1`, [SPLIT]);
    t = await as(STAFF, `select head from public.mob_totals where mob_id = $1`, [HEIFERS]);
    expect(t.rows[0].head === 30, `after restore head = ${t.rows[0].head}`);
  });

  await test('editing a past count corrects the total', async () => {
    await as(STAFF, `update public.stock_event_lines set head_change = 52 where stock_event_id = $1`, [ARRIVAL]);
    const t = await as(STAFF, `select head from public.mob_totals where mob_id = $1`, [HEIFERS]);
    expect(t.rows[0].head === 32, `head = ${t.rows[0].head}`);
    await as(STAFF, `update public.stock_event_lines set head_change = 50 where stock_event_id = $1`, [ARRIVAL]);
  });

  await test('a paddock must belong to the property it is recorded on', async () => {
    const BAD = '20000000-0000-0000-0000-0000000000e9';
    await as(STAFF, `insert into public.stock_events (id, event_type) values ($1, 'paddock_move')`, [BAD]);
    const err = await fails(STAFF, `insert into public.mob_location_changes (stock_event_id, mob_id, property_id, paddock_id) values ($1, $2, $3, $4)`,
      [BAD, HEIFERS, OTHER_PROP, CREEK]);
    expect(err, 'Creek paddock was accepted on Bimbadeen');
  });

  await test('a mob taken below zero shows up for a recount', async () => {
    const DEATHS = '20000000-0000-0000-0000-0000000000e4';
    await as(STAFF, `insert into public.stock_events (id, event_type, reason) values ($1, 'count_adjustment', 'missing')`, [DEATHS]);
    await as(STAFF, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change) values ($1, $2, $3, -25)`,
      [DEATHS, NEW_MOB, CLASS]);
    const r = await as(STAFF, `select head from public.mobs_below_zero where mob_id = $1`, [NEW_MOB]);
    expect(r.rows[0]?.head === -5, 'below-zero mob not listed');
    await as(STAFF, `update public.stock_events set deleted_at = now() where id = $1`, [DEATHS]);
  });

  await test('contractors cannot see stock', async () => {
    const r = await as(CONTRACTOR, `select count(*)::int as n from public.mob_totals`);
    expect(r.rows[0].n === 0, 'contractor can see mobs');
  });

  await test('a recount closes the recount reminder', async () => {
    const MOVE = '20000000-0000-0000-0000-0000000000f1';
    await as(STAFF, `insert into public.stock_events (id, event_type, expected_head, counted_head, discrepancy_action)
                     values ($1, 'paddock_move', 30, 28, 'recount_later')`, [MOVE]);
    const q = `select count(*)::int as n from public.reminders where kind = 'recount' and record_id = $1`;
    let r = await as(STAFF, q, [MOVE]);
    expect(r.rows[0].n === 1, 'no recount reminder');
    await as(STAFF, `update public.stock_events set discrepancy_action = 'recounted' where id = $1`, [MOVE]);
    r = await as(STAFF, q, [MOVE]);
    expect(r.rows[0].n === 0, 'reminder still showing after recount');
  });
}
