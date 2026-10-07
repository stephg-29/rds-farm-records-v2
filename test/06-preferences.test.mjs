// Each person's own settings (Home layout, bottom bar): theirs alone.
export default async function ({ as, fails, test, expect, users }) {
  const { OWNER, STAFF, CONTRACTOR } = users;

  await test('a person saves their own settings, keyed by their user id', async () => {
    await as(STAFF, `insert into public.user_preferences (prefs) values ('{"nav": ["map", "feed", "issues"]}')`);
    const r = await as(STAFF, `select id, prefs->'nav'->>1 as second from public.user_preferences`);
    expect(r.rows.length === 1 && r.rows[0].id === STAFF && r.rows[0].second === 'feed', JSON.stringify(r.rows));
  });

  await test("nobody else can read them, not even the owner", async () => {
    const o = await as(OWNER, `select count(*)::int as n from public.user_preferences`);
    const c = await as(CONTRACTOR, `select count(*)::int as n from public.user_preferences`);
    expect(o.rows[0].n === 0 && c.rows[0].n === 0, `owner sees ${o.rows[0].n}, contractor ${c.rows[0].n}`);
  });

  await test("nobody can save settings under someone else's id or change theirs", async () => {
    const refused = await fails(OWNER, `insert into public.user_preferences (id, prefs) values ($1, '{}')`, [STAFF]);
    const u = await as(OWNER, `update public.user_preferences set prefs = '{}' where id = $1`, [STAFF]);
    const r = await as(STAFF, `select prefs->'nav'->>0 as first from public.user_preferences`);
    expect(refused !== null && u.affectedRows === 0 && r.rows[0].first === 'map', `updated ${u.affectedRows}, first ${r.rows[0].first}`);
  });

  await test('a contractor can keep their own settings too', async () => {
    await as(CONTRACTOR, `insert into public.user_preferences (prefs) values ('{}')`);
    await as(CONTRACTOR, `update public.user_preferences set prefs = '{"home": {"tiles": []}}'`);
    const r = await as(CONTRACTOR, `select count(*)::int as n from public.user_preferences`);
    expect(r.rows[0].n === 1, String(r.rows[0].n));
  });
}
