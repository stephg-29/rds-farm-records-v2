-- ============================================================
-- Farm Records v2 · 0005 Spray, pasture and fertiliser, contractor jobs
--
-- Spray records follow the NSW Pesticides Regulation record fields.
-- A spray's grazing withhold puts its paddocks under withhold, which
-- the map shows and the move form warns about.
--
-- Contractors: an owner creates a job (paddocks + dates) and assigns
-- it to a contractor login. While the job is open, the contractor can
-- see only those paddocks (with areas) and their property's name, and
-- can add and edit spray or pasture records for that job only.
-- ============================================================

create table public.jobs (
  id                  uuid primary key default gen_random_uuid(),
  job_type            text not null check (job_type in ('spray', 'fertiliser', 'sowing', 'other')),
  contractor_user_id  uuid not null references public.profiles (user_id),
  property_id         uuid not null references public.properties (id),
  start_date          date,
  end_date            date,
  status              text not null default 'open' check (status in ('open', 'closed')),
  instructions        text
);
call app.setup_table('jobs');
call app.farm_user_policies('jobs');

create table public.job_paddocks (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id),
  paddock_id  uuid not null references public.paddocks (id)
);
call app.setup_table('job_paddocks');
call app.farm_user_policies('job_paddocks');

-- The logged-in contractor's open jobs, and the paddocks in them.
create or replace function app.my_open_jobs()
returns setof uuid language sql stable security definer
set search_path = public
as $$
  select j.id from public.jobs j
  where j.contractor_user_id = auth.uid() and j.status = 'open' and j.deleted_at is null
    and app.is_contractor()
$$;

create or replace function app.my_job_paddocks()
returns setof uuid language sql stable security definer
set search_path = public
as $$
  select jp.paddock_id from public.job_paddocks jp
  where jp.job_id in (select app.my_open_jobs()) and jp.deleted_at is null
$$;

create policy contractors_read on public.jobs for select to authenticated using (id in (select app.my_open_jobs()));
create policy contractors_read on public.job_paddocks for select to authenticated using (job_id in (select app.my_open_jobs()));
create policy contractors_read on public.paddocks for select to authenticated using (id in (select app.my_job_paddocks()));
create policy contractors_read on public.properties for select to authenticated
  using (id in (select j.property_id from public.jobs j where j.id in (select app.my_open_jobs())));

-- ------------------------------------------------------------
-- Spray records.
-- ------------------------------------------------------------

create table public.spray_records (
  id                      uuid primary key default gen_random_uuid(),
  spray_date              date not null default current_date,
  start_time              time,
  property_id             uuid references public.properties (id),
  situation               text,
  target                  text,
  water_rate              text,
  area_ha                 numeric(10,2),
  wind_speed_direction    text,
  temperature_c           numeric(4,1),
  humidity_delta_t        text,
  applicator_user_id      uuid references public.profiles (user_id),
  applicator_name         text,
  licence_number          text,
  grazing_withhold_until  date,
  harvest_withhold_until  date,
  job_id                  uuid references public.jobs (id),
  contractor_entered      boolean not null default false,
  notes                   text
);
comment on column public.spray_records.grazing_withhold_until is 'Worked out from the products in the mix (latest date wins).';
call app.setup_table('spray_records');
call app.farm_user_policies('spray_records');

create table public.spray_record_paddocks (
  id               uuid primary key default gen_random_uuid(),
  spray_record_id  uuid not null references public.spray_records (id),
  paddock_id       uuid not null references public.paddocks (id)
);
call app.setup_table('spray_record_paddocks');
call app.farm_user_policies('spray_record_paddocks');

create table public.spray_record_items (
  id                    uuid primary key default gen_random_uuid(),
  spray_record_id       uuid not null references public.spray_records (id),
  product_id            uuid references public.products (id),
  batch_id              uuid references public.product_batches (id),
  not_from_inventory    boolean not null default false,
  product_name          text,
  batch_number          text,
  expiry_date           date,
  application_rate      text,
  quantity_used         numeric(14,3),
  grazing_whp_days      int,
  harvest_whp_days      int,
  check (product_id is not null or product_name is not null)
);
comment on column public.spray_record_items.product_name is 'For product not in the farm''s inventory (e.g. the contractor''s own chemical).';
call app.setup_table('spray_record_items');
call app.farm_user_policies('spray_record_items');

-- ------------------------------------------------------------
-- Pasture and fertiliser records.
-- ------------------------------------------------------------

create table public.pasture_records (
  id                     uuid primary key default gen_random_uuid(),
  record_date            date not null default current_date,
  record_type            text not null check (record_type in ('fertiliser', 'pasture_improvement')),
  property_id            uuid references public.properties (id),
  whole_property         boolean not null default false,
  area_ha                numeric(10,2),
  overall_rate           text,
  contractor_contact_id  uuid references public.contacts (id),
  job_id                 uuid references public.jobs (id),
  contractor_entered     boolean not null default false,
  notes                  text
);
call app.setup_table('pasture_records');
call app.farm_user_policies('pasture_records');

create table public.pasture_record_paddocks (
  id                 uuid primary key default gen_random_uuid(),
  pasture_record_id  uuid not null references public.pasture_records (id),
  paddock_id         uuid not null references public.paddocks (id)
);
call app.setup_table('pasture_record_paddocks');
call app.farm_user_policies('pasture_record_paddocks');

create table public.pasture_record_items (
  id                 uuid primary key default gen_random_uuid(),
  pasture_record_id  uuid not null references public.pasture_records (id),
  item_kind          text not null check (item_kind in ('fertiliser', 'species')),
  product_id         uuid references public.products (id),
  batch_id           uuid references public.product_batches (id),
  product_name       text,
  species_name       text,
  rate               text,
  quantity_used      numeric(14,3)
);
call app.setup_table('pasture_record_items');
call app.farm_user_policies('pasture_record_items');

-- ------------------------------------------------------------
-- Contractor access to spray and pasture records for their jobs.
-- ------------------------------------------------------------

create policy contractors_read on public.spray_records for select to authenticated
  using (job_id in (select app.my_open_jobs()));
create policy contractors_add on public.spray_records for insert to authenticated
  with check (job_id in (select app.my_open_jobs()) and contractor_entered);
create policy contractors_edit on public.spray_records for update to authenticated
  using (job_id in (select app.my_open_jobs())) with check (job_id in (select app.my_open_jobs()) and contractor_entered);

create policy contractors_all on public.spray_record_paddocks for select to authenticated
  using (spray_record_id in (select id from public.spray_records where job_id in (select app.my_open_jobs())));
create policy contractors_add on public.spray_record_paddocks for insert to authenticated
  with check (paddock_id in (select app.my_job_paddocks())
              and spray_record_id in (select id from public.spray_records where job_id in (select app.my_open_jobs())));
create policy contractors_edit on public.spray_record_paddocks for update to authenticated
  using (spray_record_id in (select id from public.spray_records where job_id in (select app.my_open_jobs())))
  with check (paddock_id in (select app.my_job_paddocks()));

create policy contractors_all on public.spray_record_items for select to authenticated
  using (spray_record_id in (select id from public.spray_records where job_id in (select app.my_open_jobs())));
create policy contractors_add on public.spray_record_items for insert to authenticated
  with check (spray_record_id in (select id from public.spray_records where job_id in (select app.my_open_jobs())));
create policy contractors_edit on public.spray_record_items for update to authenticated
  using (spray_record_id in (select id from public.spray_records where job_id in (select app.my_open_jobs())))
  with check (spray_record_id in (select id from public.spray_records where job_id in (select app.my_open_jobs())));

create policy contractors_read on public.pasture_records for select to authenticated
  using (job_id in (select app.my_open_jobs()));
create policy contractors_add on public.pasture_records for insert to authenticated
  with check (job_id in (select app.my_open_jobs()) and contractor_entered);
create policy contractors_edit on public.pasture_records for update to authenticated
  using (job_id in (select app.my_open_jobs())) with check (job_id in (select app.my_open_jobs()) and contractor_entered);

create policy contractors_all on public.pasture_record_paddocks for select to authenticated
  using (pasture_record_id in (select id from public.pasture_records where job_id in (select app.my_open_jobs())));
create policy contractors_add on public.pasture_record_paddocks for insert to authenticated
  with check (paddock_id in (select app.my_job_paddocks())
              and pasture_record_id in (select id from public.pasture_records where job_id in (select app.my_open_jobs())));

create policy contractors_all on public.pasture_record_items for select to authenticated
  using (pasture_record_id in (select id from public.pasture_records where job_id in (select app.my_open_jobs())));
create policy contractors_add on public.pasture_record_items for insert to authenticated
  with check (pasture_record_id in (select id from public.pasture_records where job_id in (select app.my_open_jobs())));

-- ------------------------------------------------------------
-- Withhold dates and chemical usage from spray and pasture items.
-- ------------------------------------------------------------

create or replace function app.spray_item_defaults()
returns trigger language plpgsql as $$
begin
  new.not_from_inventory := new.batch_id is null;
  return new;
end $$;
create trigger spray_record_items_defaults before insert or update on public.spray_record_items
  for each row execute function app.spray_item_defaults();

-- Recalculates a spray record's withhold dates from its items.
create or replace function app.refresh_spray_withholds(p_spray uuid)
returns void language plpgsql security definer
set search_path = public
as $$
begin
  update public.spray_records s
     set grazing_withhold_until = x.g, harvest_withhold_until = x.h
    from (select s2.spray_date + max(i.grazing_whp_days) as g, s2.spray_date + max(i.harvest_whp_days) as h
            from public.spray_records s2
            left join public.spray_record_items i on i.spray_record_id = s2.id and i.deleted_at is null
           where s2.id = p_spray group by s2.spray_date) x
   where s.id = p_spray
     and (s.grazing_withhold_until, s.harvest_withhold_until) is distinct from (x.g, x.h);
end $$;

create or replace function app.spray_item_changed()
returns trigger language plpgsql as $$
declare
  s record;
begin
  perform app.refresh_spray_withholds(new.spray_record_id);
  select spray_date, deleted_at into s from public.spray_records where id = new.spray_record_id;
  perform app.sync_usage('spray_record_items', new.id, new.batch_id, new.quantity_used,
                         s.spray_date, coalesce(new.deleted_at, s.deleted_at));
  return null;
end $$;
create trigger spray_record_items_changed after insert or update on public.spray_record_items
  for each row execute function app.spray_item_changed();

create or replace function app.spray_record_changed()
returns trigger language plpgsql as $$
declare
  i record;
begin
  if new.spray_date is distinct from old.spray_date or new.deleted_at is distinct from old.deleted_at then
    perform app.refresh_spray_withholds(new.id);
    for i in select * from public.spray_record_items where spray_record_id = new.id loop
      perform app.sync_usage('spray_record_items', i.id, i.batch_id, i.quantity_used,
                             new.spray_date, coalesce(i.deleted_at, new.deleted_at));
    end loop;
  end if;
  return null;
end $$;
create trigger spray_records_changed after update on public.spray_records
  for each row execute function app.spray_record_changed();

create or replace function app.pasture_item_changed()
returns trigger language plpgsql as $$
declare
  p record;
begin
  select record_date, deleted_at into p from public.pasture_records where id = new.pasture_record_id;
  perform app.sync_usage('pasture_record_items', new.id, new.batch_id, new.quantity_used,
                         p.record_date, coalesce(new.deleted_at, p.deleted_at));
  return null;
end $$;
create trigger pasture_record_items_changed after insert or update on public.pasture_record_items
  for each row execute function app.pasture_item_changed();

create or replace function app.pasture_record_changed()
returns trigger language plpgsql as $$
declare
  i record;
begin
  if new.record_date is distinct from old.record_date or new.deleted_at is distinct from old.deleted_at then
    for i in select * from public.pasture_record_items where pasture_record_id = new.id loop
      perform app.sync_usage('pasture_record_items', i.id, i.batch_id, i.quantity_used,
                             new.record_date, coalesce(i.deleted_at, new.deleted_at));
    end loop;
  end if;
  return null;
end $$;
create trigger pasture_records_changed after update on public.pasture_records
  for each row execute function app.pasture_record_changed();

-- ------------------------------------------------------------
-- Views.
-- ------------------------------------------------------------

-- Paddocks still under a grazing withhold from a spray.
create view public.paddock_grazing_withholds with (security_invoker = true) as
select sp.paddock_id, max(s.grazing_withhold_until) as grazing_withhold_until,
       (max(s.grazing_withhold_until) + 1) as grazable_from
from public.spray_record_paddocks sp
join public.spray_records s on s.id = sp.spray_record_id
where sp.deleted_at is null and s.deleted_at is null
  and s.grazing_withhold_until >= current_date
group by sp.paddock_id;

-- For the owner, when setting up a job: stock currently in the job's paddocks.
create view public.job_paddock_stock with (security_invoker = true) as
select jp.job_id, jp.paddock_id, l.mob_id, t.name as mob_name, t.head
from public.job_paddocks jp
join public.mob_current_location l on l.paddock_id = jp.paddock_id
join public.mob_totals t on t.mob_id = l.mob_id
where jp.deleted_at is null and t.head > 0;

insert into public.schema_migrations (version, applied_by) values ('0005_land_and_jobs', current_user);
