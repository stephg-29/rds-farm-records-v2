-- ============================================================
-- Farm Records v2 · 0009 Pin the search_path of every helper
--
-- Supabase's security advisor flags functions whose search_path is
-- not fixed (a function could be tricked into using a look-alike
-- table). This pins every function and procedure in the app schema
-- that doesn't already set one. Safe to re-run; run it again after
-- any later migration that adds helpers.
-- ============================================================

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature, p.prokind
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter %s %s set search_path = public, pg_temp',
                   case when r.prokind = 'p' then 'procedure' else 'function' end, r.signature);
  end loop;
end $$;

insert into public.schema_migrations (version, applied_by) values ('0009_pin_search_path', current_user);
