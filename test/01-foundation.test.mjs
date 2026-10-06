export default async function ({ as, fails, test, expect, users }) {
  const { OWNER, STAFF, CONTRACTOR } = users;
  const PROP = '10000000-0000-0000-0000-000000000001';

  await test('staff can add a property', async () => {
    await as(STAFF, `insert into public.properties (id, name, pic) values ($1, 'Kooringa', 'NA123456')`, [PROP]);
    const r = await as(STAFF, `select name from public.properties where id = $1`, [PROP]);
    expect(r.rows[0]?.name === 'Kooringa', 'property not readable after insert');
  });

  await test('an edit keeps the earlier version in change_log', async () => {
    await as(STAFF, `update public.properties set name = 'Kooringa Station', edit_reason = 'Full name' where id = $1`, [PROP]);
    const r = await as(OWNER, `select action, old_values->>'name' as old_name, new_values->>'name' as new_name, edit_reason, changed_by
                               from public.change_log where row_id = $1 order by id`, [PROP]);
    expect(r.rows.length === 2, `expected 2 log rows, got ${r.rows.length}`);
    expect(r.rows[1].action === 'update', 'second row should be an update');
    expect(r.rows[1].old_name === 'Kooringa' && r.rows[1].new_name === 'Kooringa Station', 'old and new names not logged');
    expect(r.rows[1].edit_reason === 'Full name', 'edit reason not logged');
    expect(r.rows[1].changed_by === STAFF, 'changed_by should be the staff member');
  });

  await test('an edit reason is not carried into the next edit', async () => {
    await as(STAFF, `update public.properties set notes = 'Home block' where id = $1`, [PROP]);
    const r = await as(OWNER, `select edit_reason from public.change_log where row_id = $1 order by id desc limit 1`, [PROP]);
    expect(r.rows[0].edit_reason === null, 'old reason was logged again');
  });

  await test('records can never be really deleted', async () => {
    const err = await fails(OWNER, `delete from public.properties where id = $1`, [PROP]);
    expect(err, 'delete should have failed');
  });

  await test('soft delete and restore are logged', async () => {
    await as(STAFF, `update public.properties set deleted_at = now() where id = $1`, [PROP]);
    await as(STAFF, `update public.properties set deleted_at = null where id = $1`, [PROP]);
    const r = await as(OWNER, `select action from public.change_log where row_id = $1 order by id desc limit 2`, [PROP]);
    expect(r.rows[1].action === 'delete' && r.rows[0].action === 'restore', `got ${r.rows.map((x) => x.action)}`);
  });

  await test('an edit from an out-of-date copy is flagged as a conflict', async () => {
    const before = await as(STAFF, `select updated_at from public.properties where id = $1`, [PROP]);
    await as(OWNER, `update public.properties set address = 'Walcha Rd' where id = $1`, [PROP]);
    // Sue's phone edits from the copy it had before the owner's edit.
    await as(STAFF, `update public.properties set address = 'Walcha Road', edit_base_updated_at = $2 where id = $1`,
      [PROP, before.rows[0].updated_at]);
    const r = await as(OWNER, `select has_edit_conflict from public.properties where id = $1`, [PROP]);
    expect(r.rows[0].has_edit_conflict === true, 'conflict not flagged');
  });

  await test('staff cannot see prices; owners can', async () => {
    await as(OWNER, `insert into public.record_prices (record_table, record_id, total_amount) values ('test', gen_random_uuid(), 1500)`);
    const staff = await as(STAFF, `select count(*)::int as n from public.record_prices`);
    const owner = await as(OWNER, `select count(*)::int as n from public.record_prices`);
    expect(staff.rows[0].n === 0, 'staff can see prices');
    expect(owner.rows[0].n === 1, 'owner cannot see prices');
  });

  await test('staff cannot add prices', async () => {
    const err = await fails(STAFF, `insert into public.record_prices (record_table, record_id, total_amount) values ('test', gen_random_uuid(), 9)`);
    expect(err, 'staff insert should have failed');
  });

  await test('staff cannot see price history in change_log', async () => {
    const r = await as(STAFF, `select count(*)::int as n from public.change_log where table_name = 'record_prices'`);
    expect(r.rows[0].n === 0, 'staff can see price history');
  });

  await test('contractors cannot see farm records', async () => {
    const r = await as(CONTRACTOR, `select count(*)::int as n from public.properties`);
    expect(r.rows[0].n === 0, 'contractor can see properties');
  });

  await test('staff cannot make themselves an owner', async () => {
    await as(STAFF, `update public.profiles set role = 'owner' where user_id = $1`, [STAFF]);
    const r = await as(null, `select role from public.profiles where user_id = $1`, [STAFF]);
    expect(r.rows[0].role === 'staff', 'staff changed their own role');
  });
}
