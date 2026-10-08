-- Part-treated mobs: a treatment that covered only some of the mob (e.g. 18
-- of 20 mustered). mob_head keeps how many were in the mob then; a later
-- treatment of the rest points back with follow_up_of; rest_not_needed
-- closes it without treating (e.g. the two were sold). The withhold still
-- covers the whole mob.
alter table public.treatments
  add column if not exists mob_head        int check (mob_head is null or mob_head >= 0),
  add column if not exists follow_up_of    uuid references public.treatments (id),
  add column if not exists rest_not_needed boolean not null default false;
create index if not exists treatments_follow_up_of_idx on public.treatments (follow_up_of);

-- Joined paddocks: a gate left open so stock can use two or more paddocks.
-- A mob in any of them counts as grazing all of them while it's open.
create table public.paddock_joins (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id),
  paddock_ids  uuid[] not null check (cardinality(paddock_ids) >= 2),
  opened_on    date not null default current_date,
  closed_on    date,
  notes        text
);
call app.setup_table('paddock_joins');
call app.farm_user_policies('paddock_joins');
create index paddock_joins_property_idx on public.paddock_joins (property_id);

-- Paddocks with livestock now, counting paddocks joined by an open gate to
-- one with stock in it (contractors: their job's property only, yes/no).
create or replace function app.paddocks_with_stock()
returns table (paddock_id uuid) language sql stable security definer
set search_path = public
as $$
  with occupied as (
    select distinct l.paddock_id
    from public.mob_current_location l
    join public.mob_totals t on t.mob_id = l.mob_id
    where t.head > 0 and l.paddock_id is not null
  ), reached as (
    select paddock_id from occupied
    union
    select unnest(j.paddock_ids)
    from public.paddock_joins j
    where j.deleted_at is null and j.closed_on is null and j.paddock_ids && (select array_agg(paddock_id) from occupied)
  )
  select distinct r.paddock_id
  from reached r
  join public.paddocks d on d.id = r.paddock_id
  where app.is_farm_user() or d.property_id in (select app.my_job_properties())
$$;

insert into public.schema_migrations (version, applied_by) values ('0025_part_treated_and_joined_paddocks', current_user);
