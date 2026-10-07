-- Which paddocks have livestock recorded in them right now. Contractors
-- can't see stock, but must know before spraying (they're liable): they get
-- only "livestock recorded here" for paddocks on their open jobs' property,
-- never mob names or numbers. Farm users get every paddock.
create or replace function app.paddocks_with_stock()
returns table (paddock_id uuid) language sql stable security definer
set search_path = public
as $$
  select distinct l.paddock_id
  from public.mob_current_location l
  join public.mob_totals t on t.mob_id = l.mob_id
  join public.paddocks d on d.id = l.paddock_id
  where t.head > 0 and l.paddock_id is not null
    and (app.is_farm_user() or d.property_id in (select app.my_job_properties()))
$$;

create view public.paddocks_with_stock with (security_invoker = true) as
select paddock_id from app.paddocks_with_stock();

insert into public.schema_migrations (version, applied_by) values ('0022_paddocks_with_stock', current_user);
