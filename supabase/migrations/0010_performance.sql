-- ============================================================
-- Farm Records v2 · 0010 Performance tidy-ups (from the Supabase
-- performance advisor)
--
-- 1. An index for every foreign key that doesn't have one, so
--    lookups stay fast as records build up over years. Safe to
--    re-run after later migrations add tables.
-- 2. Policies that check the logged-in user once per query instead
--    of once per row ((select auth.uid()) instead of auth.uid()).
--
-- Left as is on purpose: separate owner/staff/contractor policies on
-- the same table. They are easier to read and the cost is negligible
-- at farm scale.
-- ============================================================

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname,
           array_agg(a.attname order by k.ord) as cols
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    cross join lateral unnest(c.conkey) with ordinality as k (attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey
      )
    group by c.conrelid, c.conname
  loop
    execute format('create index if not exists %I on %s (%s)',
                   left(r.conname, 59) || '_idx', r.tbl,
                   (select string_agg(format('%I', col), ', ') from unnest(r.cols) as col));
  end loop;
end $$;

alter policy read_own_or_owner on public.profiles
  using (user_id = (select auth.uid()) or app.is_farm_user());

alter policy own_or_owner_read on public.alerts
  using (user_id = (select auth.uid()) or app.is_owner());

alter policy own_or_owner_edit on public.alerts
  using (user_id = (select auth.uid()) or app.is_owner())
  with check (user_id = (select auth.uid()) or app.is_owner());

insert into public.schema_migrations (version, applied_by) values ('0010_performance', current_user);
