export default async function ({ as, fails, test, expect, users }) {
  const { OWNER, STAFF, CONTRACTOR } = users;
  const id = (n) => `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const PROP = id(1), PADDOCK = id(2);
  const WEANERS = id(10), DRAFT_APPLIED = id(11), DRAFT_CLEAN = id(12), STEERS = id(13);
  const CYDECTIN = id(20), BATCH = id(21), SPRAY = id(22);
  const CLASS = id(30);

  await as(STAFF, `insert into public.properties (id, name) values ($1, 'Kooringa')`, [PROP]);
  await as(STAFF, `insert into public.paddocks (id, property_id, name) values ($1, $2, 'Back gully')`, [PADDOCK, PROP]);
  await as(STAFF, `insert into public.livestock_classes (id, species, name) values ($1, 'cattle', 'Weaner steers')`, [CLASS]);
  await as(STAFF, `insert into public.mobs (id, name, species) values
                     ($1, 'Weaner steers', 'cattle'), ($2, 'Draft A', 'cattle'), ($3, 'Draft B', 'cattle'), ($4, 'Trade steers', 'cattle')`,
    [WEANERS, DRAFT_APPLIED, DRAFT_CLEAN, STEERS]);

  // 64 weaners arrive.
  await as(STAFF, `insert into public.stock_events (id, event_date, event_type) values ($1, current_date - 30, 'arrival')`, [id(40)]);
  await as(STAFF, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change) values ($1, $2, $3, 64)`,
    [id(40), WEANERS, CLASS]);

  await as(STAFF, `insert into public.products (id, name, product_kind, chemical_group, stock_unit, label_whp_days, label_esi_days)
                   values ($1, 'Cydectin Pour-On', 'animal_treatment', 'ML', 'L', 42, 42),
                          ($2, '2,4-D Amine 625', 'spray', '4', 'L', null, null)`, [CYDECTIN, SPRAY]);
  await as(STAFF, `insert into public.product_batches (id, product_id, batch_number, expiry_date) values ($1, $2, '4471K', '2027-03-31')`,
    [BATCH, CYDECTIN]);
  await as(STAFF, `insert into public.chemical_ledger (batch_id, entry_type, quantity) values ($1, 'received', 3)`, [BATCH]);

  const TREAT = id(50), ITEM = id(51);
  await test('a treatment fills in WHP/ESI dates and takes product out of stock', async () => {
    await as(STAFF, `insert into public.treatments (id, treatment_date, mob_id, head_treated, paddock_id, treated_by_user_id)
                     values ($1, current_date - 2, $2, 64, $3, $4)`, [TREAT, WEANERS, PADDOCK, STAFF]);
    await as(STAFF, `insert into public.treatment_items (id, treatment_id, product_id, batch_id, quantity_used, whp_days, esi_days)
                     values ($1, $2, $3, $4, 1.79, 42, 42)`, [ITEM, TREAT, CYDECTIN, BATCH]);
    const i = await as(STAFF, `select whp_until = current_date + 40 as ok, not_from_inventory from public.treatment_items where id = $1`, [ITEM]);
    expect(i.rows[0].ok, 'whp_until is not treatment date + 42');
    expect(i.rows[0].not_from_inventory === false, 'wrongly flagged not from inventory');
    const s = await as(STAFF, `select on_hand::float as q from public.chemical_on_hand where batch_id = $1`, [BATCH]);
    expect(Math.abs(s.rows[0].q - 1.21) < 0.001, `on hand ${s.rows[0].q}, expected 1.21`);
  });

  await test('the treated mob shows as under withhold', async () => {
    const r = await as(STAFF, `select products from public.active_withholds where mob_id = $1`, [WEANERS]);
    expect(r.rows[0]?.products === 'Cydectin Pour-On', 'weaners not under withhold');
  });

  await test('a split carries the withhold only where the user applied it', async () => {
    const SPLIT = id(60);
    await as(STAFF, `insert into public.stock_events (id, event_date, event_type) values ($1, current_date - 1, 'split')`, [SPLIT]);
    await as(STAFF, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change, withhold_choice) values
                       ($1, $2, $5, -30, null), ($1, $3, $5, 20, 'applied'), ($1, $4, $5, 10, 'not_applied')`,
      [SPLIT, WEANERS, DRAFT_APPLIED, DRAFT_CLEAN, CLASS]);
    const r = await as(STAFF, `select mob_id from public.active_withholds where mob_id in ($1, $2)`, [DRAFT_APPLIED, DRAFT_CLEAN]);
    const mobs = r.rows.map((x) => x.mob_id);
    expect(mobs.includes(DRAFT_APPLIED), 'applied draft is not under withhold');
    expect(!mobs.includes(DRAFT_CLEAN), 'not-applied draft is under withhold');
  });

  const SALE = id(70);
  await test('selling stock under withhold is kept, flagged, and alerts the seller and owner', async () => {
    await as(STAFF, `insert into public.stock_events (id, event_date, event_type, reason, market) values ($1, current_date, 'exit', 'slaughter', 'domestic')`, [SALE]);
    await as(STAFF, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change) values ($1, $2, $3, -20)`,
      [SALE, DRAFT_APPLIED, CLASS]);
    const e = await as(STAFF, `select needs_review from public.stock_events where id = $1`, [SALE]);
    expect(e.rows[0].needs_review === true, 'sale not flagged');
    const owner = await as(OWNER, `select message, severity from public.alerts where record_id = $1 and user_id = $2`, [SALE, OWNER]);
    const staff = await as(STAFF, `select count(*)::int as n from public.alerts where record_id = $1 and user_id = $2`, [SALE, STAFF]);
    expect(owner.rows[0]?.severity === 'urgent', 'owner did not get an urgent alert');
    expect(owner.rows[0].message.includes('20 head from Draft A') && owner.rows[0].message.includes('Cydectin'), owner.rows[0].message);
    expect(staff.rows[0].n === 1, 'the person who recorded the sale did not get the alert');
  });

  await test('a sale with an override reason is not flagged', async () => {
    const SALE2 = id(71);
    await as(STAFF, `insert into public.stock_events (id, event_date, event_type, reason, withhold_override_reason)
                     values ($1, current_date, 'exit', 'sale', 'Sold to backgrounder, buyer told of WHP')`, [SALE2]);
    await as(STAFF, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change) values ($1, $2, $3, -5)`,
      [SALE2, WEANERS, CLASS]);
    const e = await as(STAFF, `select needs_review from public.stock_events where id = $1`, [SALE2]);
    expect(e.rows[0].needs_review === false, 'override sale was flagged');
  });

  await test("Jim and Sue: a drench that syncs after the sale still raises the alert", async () => {
    // Sue's phone syncs first: 15 trade steers sold today, no withhold known.
    await as(STAFF, `insert into public.stock_events (id, event_date, event_type) values ($1, current_date - 5, 'arrival')`, [id(80)]);
    await as(STAFF, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change) values ($1, $2, $3, 15)`,
      [id(80), STEERS, CLASS]);
    const SALE3 = id(81);
    await as(STAFF, `insert into public.stock_events (id, event_date, event_type, reason, market) values ($1, current_date, 'exit', 'sale', 'export')`, [SALE3]);
    await as(STAFF, `insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change) values ($1, $2, $3, -15)`,
      [SALE3, STEERS, CLASS]);
    let e = await as(STAFF, `select needs_review from public.stock_events where id = $1`, [SALE3]);
    expect(e.rows[0].needs_review === false, 'flagged before the drench arrived');
    // Jim's phone syncs: he drenched them yesterday.
    await as(STAFF, `insert into public.treatments (id, treatment_date, mob_id, head_treated) values ($1, current_date - 1, $2, 15)`, [id(82), STEERS]);
    await as(STAFF, `insert into public.treatment_items (treatment_id, product_id, batch_id, quantity_used, whp_days, esi_days)
                     values ($1, $2, $3, 0.4, 42, 42)`, [id(82), CYDECTIN, BATCH]);
    e = await as(STAFF, `select needs_review from public.stock_events where id = $1`, [SALE3]);
    expect(e.rows[0].needs_review === true, 'late-syncing drench did not flag the sale');
  });

  await test('deleting a treatment puts the product back in stock', async () => {
    await as(STAFF, `update public.treatments set deleted_at = now() where id = $1`, [TREAT]);
    const s = await as(STAFF, `select on_hand::float as q from public.chemical_on_hand where batch_id = $1`, [BATCH]);
    expect(Math.abs(s.rows[0].q - 2.6) < 0.001, `on hand ${s.rows[0].q}, expected 2.6 (3 - 0.4)`);
    await as(STAFF, `update public.treatments set deleted_at = null where id = $1`, [TREAT]);
  });

  await test('editing quantity used corrects stock on hand', async () => {
    await as(STAFF, `update public.treatment_items set quantity_used = 2.0 where id = $1`, [ITEM]);
    const s = await as(STAFF, `select on_hand::float as q from public.chemical_on_hand where batch_id = $1`, [BATCH]);
    expect(Math.abs(s.rows[0].q - 0.6) < 0.001, `on hand ${s.rows[0].q}, expected 0.6 (3 - 2.0 - 0.4)`);
  });

  await test('a write-off must give a reason', async () => {
    const err = await fails(STAFF, `insert into public.chemical_ledger (batch_id, entry_type, quantity) values ($1, 'written_off', -0.5)`, [BATCH]);
    expect(err, 'write-off without a reason was accepted');
  });

  await test('contractors see spray products but not animal treatments', async () => {
    const r = await as(CONTRACTOR, `select name from public.products order by name`);
    expect(r.rows.length === 1 && r.rows[0].name === '2,4-D Amine 625', `contractor sees ${r.rows.map((x) => x.name)}`);
  });
}
