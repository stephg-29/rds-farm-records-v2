export default async function ({ as, fails, test, expect, users }) {
  const { OWNER, STAFF, CONTRACTOR } = users;
  const id = (n) => `40000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const PROP = id(1), RIVER = id(2), GULLY = id(3), HOUSE = id(4);
  const COWS = id(10), STEERS = id(11);
  const CLASS = id(20);

  await as(OWNER, `insert into public.properties (id, name, pic) values ($1, 'Glenvale', 'NC345678')`, [PROP]);
  await as(OWNER, `insert into public.paddocks (id, property_id, name, area_ha) values
                     ($1, $4, 'River flat', 36.2), ($2, $4, 'Back gully', 44.8), ($3, $4, 'House paddock', 12.4)`,
    [RIVER, GULLY, HOUSE, PROP]);
  await as(OWNER, `insert into public.livestock_classes (id, species, name) values ($1, 'cattle', 'Module test class')`, [CLASS]);
  await as(OWNER, `insert into public.mobs (id, name, species) values ($1, 'River cows', 'cattle'), ($2, 'Gully steers', 'cattle')`,
    [COWS, STEERS]);
  const ARR = id(30);
  await as(OWNER, `insert into public.stock_events (id, event_date, event_type) values ($1, '2025-06-15', 'arrival')`, [ARR]);
  await as(OWNER, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change) values
                     ($1, $2, $4, 112), ($1, $3, $4, 64)`, [ARR, COWS, STEERS, CLASS]);
  await as(OWNER, `insert into public.mob_location_changes (stock_event_id, mob_id, property_id, paddock_id) values
                     ($1, $2, $4, $5), ($1, $3, $4, $6)`, [ARR, COWS, STEERS, PROP, RIVER, GULLY]);

  // ---- breeding ----
  await test('a joining works out expected calving from gestation length', async () => {
    await as(STAFF, `insert into public.joinings (id, mob_id, start_date, end_date, sire_description)
                     values ($1, $2, '2026-11-01', '2027-01-15', '3 Angus bulls')`, [id(40), COWS]);
    const r = await as(STAFF, `select expected_birth_start::text as s, expected_birth_end::text as e from public.joinings where id = $1`, [id(40)]);
    expect(r.rows[0].s === '2027-08-11' && r.rows[0].e === '2027-10-25', `got ${r.rows[0].s} to ${r.rows[0].e}`);
  });

  // ---- contractor jobs ----
  const JOB = id(50);
  await as(OWNER, `insert into public.jobs (id, job_type, contractor_user_id, property_id, start_date, end_date, instructions)
                   values ($1, 'spray', $2, $3, current_date - 1, current_date + 4, 'Fleabane and thistles')`, [JOB, CONTRACTOR, PROP]);
  await as(OWNER, `insert into public.job_paddocks (job_id, paddock_id) values ($1, $2), ($1, $3)`, [JOB, RIVER, GULLY]);

  await test('the owner is warned about stock in job paddocks', async () => {
    const r = await as(OWNER, `select mob_name, head from public.job_paddock_stock where job_id = $1 order by mob_name`, [JOB]);
    expect(r.rows.length === 2 && r.rows[0].mob_name === 'Gully steers' && r.rows[0].head === 64, JSON.stringify(r.rows));
  });

  await as(OWNER, `insert into public.map_features (id, property_id, feature_type, name, geometry) values
                     ($1, $2, 'gate', 'Front gate', '{"type":"Point","coordinates":[151.5,-30.5]}')`, [id(51), PROP]);

  await test("a contractor sees the job property's paddocks and fences, to find their way", async () => {
    const r = await as(CONTRACTOR, `select name, area_ha::float as ha from public.paddocks order by name`);
    expect(r.rows.map((x) => x.name).join() === 'Back gully,House paddock,River flat', `sees ${r.rows.map((x) => x.name)}`);
    const f = await as(CONTRACTOR, `select name from public.map_features`);
    expect(f.rows.length === 1 && f.rows[0].name === 'Front gate', `features ${f.rows.map((x) => x.name)}`);
    const p = await as(CONTRACTOR, `select name from public.properties`);
    expect(p.rows.length === 1 && p.rows[0].name === 'Glenvale', 'should see only the job property');
  });

  const SPRAY = id(60);
  await test('a contractor can record a spray for their job, with their own chemical', async () => {
    await as(CONTRACTOR, `insert into public.spray_records (id, spray_date, property_id, job_id, contractor_entered, applicator_name, target)
                          values ($1, current_date, $2, $3, true, 'Dave', 'Fleabane')`, [SPRAY, PROP, JOB]);
    await as(CONTRACTOR, `insert into public.spray_record_paddocks (spray_record_id, paddock_id) values ($1, $2)`, [SPRAY, RIVER]);
    await as(CONTRACTOR, `insert into public.spray_record_items (spray_record_id, product_name, batch_number, application_rate, grazing_whp_days)
                          values ($1, 'Contractor 2,4-D', 'B77', '1.5 L/ha', 7)`, [SPRAY]);
    const r = await as(OWNER, `select contractor_entered, grazing_withhold_until = current_date + 7 as ok from public.spray_records where id = $1`, [SPRAY]);
    expect(r.rows[0].contractor_entered && r.rows[0].ok, 'spray record or its withhold date is wrong');
  });

  await test('a contractor can record a paddock as only part done (rain), and it still has the withhold', async () => {
    await as(CONTRACTOR, `insert into public.spray_record_paddocks (spray_record_id, paddock_id, coverage, area_done_ha, part_reason) values ($1, $2, 'part', 20, 'Rain')`, [SPRAY, GULLY]);
    const r = await as(OWNER, `select coverage, area_done_ha::float as ha, part_reason from public.spray_record_paddocks where paddock_id = $1`, [GULLY]);
    const w = await as(STAFF, `select count(*)::int as n from public.paddock_grazing_withholds where paddock_id = $1`, [GULLY]);
    expect(r.rows[0].coverage === 'part' && r.rows[0].ha === 20 && r.rows[0].part_reason === 'Rain' && w.rows[0].n === 1, JSON.stringify(r.rows) + w.rows[0].n);
  });

  await test('the sprayed paddock is under grazing withhold', async () => {
    const r = await as(STAFF, `select grazable_from = current_date + 8 as ok from public.paddock_grazing_withholds where paddock_id = $1`, [RIVER]);
    expect(r.rows[0]?.ok, 'paddock not under grazing withhold, or wrong grazable date');
  });

  await test('a contractor cannot record a spray on a paddock outside the job', async () => {
    const err = await fails(CONTRACTOR, `insert into public.spray_record_paddocks (spray_record_id, paddock_id) values ($1, $2)`, [SPRAY, HOUSE]);
    expect(err, 'contractor added House paddock');
  });

  await test('a contractor cannot see stock, treatments or other spray records', async () => {
    const m = await as(CONTRACTOR, `select count(*)::int as n from public.mobs`);
    const t = await as(CONTRACTOR, `select count(*)::int as n from public.treatments`);
    expect(m.rows[0].n === 0 && t.rows[0].n === 0, 'contractor can see farm records');
  });

  await test('a contractor is told which paddocks have livestock, but not what or how many', async () => {
    const r = await as(CONTRACTOR, `select * from public.paddocks_with_stock`);
    const ids = r.rows.map((x) => x.paddock_id).sort();
    expect(ids.join() === [RIVER, GULLY].sort().join() && Object.keys(r.rows[0]).join() === 'paddock_id', JSON.stringify(r.rows));
    // Farm users get every paddock with stock (other tests' paddocks too).
    const o = await as(STAFF, `select paddock_id from public.paddocks_with_stock`);
    expect([RIVER, GULLY].every((p) => o.rows.some((x) => x.paddock_id === p)), JSON.stringify(o.rows));
  });

  await test('closing the job ends contractor access', async () => {
    await as(OWNER, `update public.jobs set status = 'closed' where id = $1`, [JOB]);
    const w = await as(CONTRACTOR, `select count(*)::int as n from public.paddocks_with_stock`);
    expect(w.rows[0].n === 0, 'still told about stock after the job closed');
    const r = await as(CONTRACTOR, `select count(*)::int as n from public.paddocks`);
    const s = await as(CONTRACTOR, `select count(*)::int as n from public.spray_records`);
    const f = await as(CONTRACTOR, `select count(*)::int as n from public.map_features`);
    expect(r.rows[0].n === 0 && s.rows[0].n === 0 && f.rows[0].n === 0, 'contractor still has access after the job closed');
  });

  // ---- feed ----
  const LICK = id(70), HAY = id(71), LOT = id(72), HAYLOT = id(73), SHED = id(74), FEED = id(75), RATION = id(76);
  await as(STAFF, `insert into public.feed_storage_sites (id, property_id, name, site_type) values ($1, $2, 'Big hay shed', 'hay_shed')`, [SHED, PROP]);
  await as(STAFF, `insert into public.feed_items (id, name, feed_type, unit, whp_days) values ($1, 'Medicated lick', 'supplement_lick', 'kg', 14)`, [LICK]);
  await as(STAFF, `insert into public.feed_items (id, name, feed_type, unit, kg_per_unit) values ($1, 'Pasture hay', 'hay', 'round_bale', 400)`, [HAY]);
  await as(STAFF, `insert into public.feed_lots (id, feed_item_id, source) values ($1, $2, 'purchased'), ($3, $4, 'purchased')`, [LOT, LICK, HAYLOT, HAY]);
  await as(STAFF, `insert into public.feed_ledger (feed_lot_id, storage_site_id, entry_type, quantity) values ($1, $3, 'purchased', 100), ($2, $3, 'purchased', 140)`,
    [LOT, HAYLOT, SHED]);

  await test('feeding a medicated lick puts the mob under withhold and draws down stock', async () => {
    await as(STAFF, `insert into public.feeding_events (id, feed_date, mob_id, head_fed) values ($1, current_date, $2, 64)`, [FEED, STEERS]);
    await as(STAFF, `insert into public.feed_ledger (feed_lot_id, storage_site_id, entry_type, quantity, feeding_event_id) values ($1, $2, 'fed_out', -10, $3)`,
      [LOT, SHED, FEED]);
    const w = await as(STAFF, `select products from public.active_withholds where mob_id = $1`, [STEERS]);
    expect(w.rows[0]?.products === 'Medicated lick', 'mob not under feed withhold');
    const s = await as(STAFF, `select on_hand::float as q from public.feed_on_hand where feed_lot_id = $1`, [LOT]);
    expect(s.rows[0].q === 90, `lick on hand ${s.rows[0].q}`);
  });

  await test('deleting the feeding event removes the withhold and puts the feed back', async () => {
    await as(STAFF, `update public.feeding_events set deleted_at = now() where id = $1`, [FEED]);
    const w = await as(STAFF, `select count(*)::int as n from public.active_withholds where mob_id = $1`, [STEERS]);
    const s = await as(STAFF, `select on_hand::float as q from public.feed_on_hand where feed_lot_id = $1`, [LOT]);
    expect(w.rows[0].n === 0 && s.rows[0].q === 100, `withholds ${w.rows[0].n}, on hand ${s.rows[0].q}`);
  });

  await test('days of feed left at current rations', async () => {
    await as(STAFF, `insert into public.rations (id, name) values ($1, 'Maintenance')`, [RATION]);
    await as(STAFF, `insert into public.ration_items (ration_id, feed_item_id, kg_per_head_per_day) values ($1, $2, 8)`, [RATION, HAY]);
    await as(STAFF, `insert into public.ration_assignments (ration_id, mob_id, start_date) values ($1, $2, current_date - 3)`, [RATION, COWS]);
    // 140 bales x 400 kg = 56,000 kg; 112 cows x 8 kg = 896 kg a day; 62 days.
    const r = await as(STAFF, `select days_left from public.feed_days_remaining where feed_item_id = $1`, [HAY]);
    expect(r.rows[0]?.days_left === 62, `days left ${r.rows[0]?.days_left}`);
  });

  // ---- map, issues, vehicles ----
  await test('an issue marked done records who and when', async () => {
    await as(STAFF, `insert into public.issues (id, categories, lat, lng, paddock_id, notes) values ($1, '{Float valve}', -30.4991, 151.5032, $2, 'Stuck open')`,
      [id(80), RIVER]);
    await as(STAFF, `update public.issues set status = 'done' where id = $1`, [id(80)]);
    const r = await as(STAFF, `select resolved_by, resolved_at is not null as has_time from public.issues where id = $1`, [id(80)]);
    expect(r.rows[0].resolved_by === STAFF && r.rows[0].has_time, 'resolution not stamped');
  });

  await test('vehicle work done is saved as checkboxes and feeds reminders', async () => {
    await as(STAFF, `insert into public.vehicles (id, name, reading_unit) values ($1, 'Hilux', 'km')`, [id(90)]);
    await as(STAFF, `insert into public.vehicle_services (vehicle_id, reading, work_done, next_due_date)
                     values ($1, 142000, '{Engine oil,Oil filter,Fuel filter}', current_date + 5)`, [id(90)]);
    const h = await as(STAFF, `select array_length(last_work_done, 1) as n from public.vehicle_history where vehicle_id = $1`, [id(90)]);
    const r = await as(STAFF, `select count(*)::int as n from public.reminders where kind = 'vehicle_service_due' and record_id = $1`, [id(90)]);
    expect(h.rows[0].n === 3 && r.rows[0].n === 1, 'checkboxes or reminder missing');
  });

  await test('default lists are loaded', async () => {
    const r = await as(STAFF, `select count(*)::int as n from public.pick_lists where list_name = 'vehicle_work_done'`);
    expect(r.rows[0].n === 16, `vehicle work-done list has ${r.rows[0].n} items`);
  });

  // ---- reports ----
  await test('livestock reconciliation adds up for the financial year', async () => {
    await as(OWNER, `insert into public.stock_events (id, event_date, event_type, reason) values ($1, '2025-09-01', 'exit', 'sale')`, [id(100)]);
    await as(OWNER, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change) values ($1, $2, $3, -14)`,
      [id(100), STEERS, CLASS]);
    await as(OWNER, `insert into public.stock_events (id, event_date, event_type) values ($1, '2026-02-10', 'death')`, [id(101)]);
    await as(OWNER, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change) values ($1, $2, $3, -2)`,
      [id(101), COWS, CLASS]);
    const r = await as(OWNER, `select * from public.livestock_reconciliation('2025-07-01', '2026-06-30') where class_name = 'Module test class'`);
    const x = r.rows[0];
    expect(x.opening === 176 && x.sales === 14 && x.deaths === 2 && x.closing === 160,
      `opening ${x.opening}, sales ${x.sales}, deaths ${x.deaths}, closing ${x.closing}`);
    expect(x.opening + x.births + x.purchases - x.sales - x.deaths + x.other_changes === x.closing, 'does not add up');
  });

  await test('a starting count entered during the year counts as opening, not other', async () => {
    const START_CLASS = id(110);
    await as(OWNER, `insert into public.livestock_classes (id, species, name) values ($1, 'cattle', 'Start test class')`, [START_CLASS]);
    await as(OWNER, `insert into public.stock_events (id, event_date, event_type, reason) values ($1, '2025-10-01', 'count_adjustment', 'opening_count')`, [id(111)]);
    await as(OWNER, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change) values ($1, $2, $3, 30)`, [id(111), COWS, START_CLASS]);
    await as(OWNER, `insert into public.stock_events (id, event_date, event_type, reason) values ($1, '2025-11-01', 'count_adjustment', 'missing')`, [id(112)]);
    await as(OWNER, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change) values ($1, $2, $3, -1)`, [id(112), COWS, START_CLASS]);
    const r = await as(OWNER, `select * from public.livestock_reconciliation('2025-07-01', '2026-06-30') where class_name = 'Start test class'`);
    const x = r.rows[0];
    expect(x.opening === 30 && x.other_changes === -1 && x.closing === 29, `opening ${x.opening}, other ${x.other_changes}, closing ${x.closing}`);
  });

  await test('reminders list a joining with calving due', async () => {
    await as(STAFF, `insert into public.joinings (mob_id, start_date) values ($1, current_date - 270)`, [COWS]);
    const r = await as(STAFF, `select count(*)::int as n from public.reminders where kind = 'births_due'`);
    expect(r.rows[0].n >= 1, 'calving reminder missing');
  });

  await test('the LPA treatment register shows a safe-for-slaughter date', async () => {
    const r = await as(STAFF, `select count(*)::int as n from public.lpa_treatment_register where safe_for_slaughter is not null`);
    expect(r.rows[0].n >= 1, 'register empty');
  });
}
