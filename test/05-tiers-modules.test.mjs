export default async function ({ as, fails, test, expect, users }) {
  const { OWNER, STAFF } = users;
  const status = async (key) =>
    (await as(OWNER, `select status, visible from public.farm_modules where key = $1`, [key])).rows[0];
  const setModules = (user, list) =>
    as(user, `update public.farm_settings set enabled_modules = $1`, [list]);
  const allTier1 = async () =>
    (await as(OWNER, `select array_agg(key order by sort_order) as k from public.modules where not is_core and min_tier = 1`)).rows[0].k;

  await test('a new farm starts on Tier 1 with every Tier 1 module on', async () => {
    const s = await as(OWNER, `select tier, cardinality(enabled_modules) as n from public.farm_settings`);
    expect(s.rows[0].tier === 1 && s.rows[0].n === 12, `tier ${s.rows[0].tier}, ${s.rows[0].n} modules on`);
    expect((await status('stock')).status === 'core', 'stock should be core');
    expect((await status('individual_animals')).status === 'locked', 'individual animals should be locked on Tier 1');
  });

  await test('an owner cannot change the tier', async () => {
    const err = await fails(OWNER, `update public.farm_settings set tier = 2`);
    expect(err && err.includes('Rural Data Services'), `expected the tier lock, got: ${err}`);
  });

  await test('an owner can untick the map, and ticking it again brings it back', async () => {
    const all = await allTier1();
    await setModules(OWNER, all.filter((k) => k !== 'map'));
    let m = await status('map');
    expect(m.status === 'off' && m.visible === false, `map is ${m.status}`);
    await setModules(OWNER, all);
    m = await status('map');
    expect(m.status === 'on' && m.visible === true, `map is ${m.status}`);
  });

  await test('staff cannot change which modules are on', async () => {
    await setModules(STAFF, ['treatments']);
    const s = await as(OWNER, `select cardinality(enabled_modules) as n from public.farm_settings`);
    expect(s.rows[0].n === 12, 'staff changed the module list');
  });

  await test('an owner cannot tick a module above their tier', async () => {
    const all = await allTier1();
    const err = await fails(OWNER, `update public.farm_settings set enabled_modules = $1`, [[...all, 'individual_animals']]);
    expect(err && err.includes('Tier 2'), `expected a tier message, got: ${err}`);
  });

  await test('contractor jobs need spray or pasture switched on', async () => {
    const all = await allTier1();
    const err = await fails(OWNER, `update public.farm_settings set enabled_modules = $1`,
      [all.filter((k) => k !== 'spray' && k !== 'pasture')]);
    expect(err && err.includes('contractor_jobs'), `expected a dependency message, got: ${err}`);
  });

  await test('an unknown module is rejected', async () => {
    const err = await fails(OWNER, `update public.farm_settings set enabled_modules = array['teleporter']`);
    expect(err && err.includes('Unknown module'), `got: ${err}`);
  });

  await test('Rural Data Services can upgrade the tier, which unlocks and switches on Tier 2 modules', async () => {
    await as(null, `update public.farm_settings set tier = 2`);
    const m = await status('individual_animals');
    expect(m.status === 'on', `individual animals is ${m.status}`);
    expect((await status('stud')).status === 'locked', 'stud should still be locked on Tier 2');
    const log = await as(OWNER, `select count(*)::int as n from public.change_log where table_name = 'farm_settings'
                                 and (old_values->>'tier') = '1' and (new_values->>'tier') = '2'`);
    expect(log.rows[0].n === 1, 'tier change not in the change log');
  });

  await test('after a downgrade, higher-tier modules show as locked', async () => {
    await as(null, `update public.farm_settings set tier = 1`);
    expect((await status('individual_animals')).status === 'locked', 'not locked after downgrade');
  });
}
