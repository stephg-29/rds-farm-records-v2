-- ============================================================
-- Farm Records v2 · 0007 Map features, issues, readings, vehicles,
--                       documents
-- ============================================================

create table public.map_features (
  id                uuid primary key default gen_random_uuid(),
  property_id       uuid not null references public.properties (id),
  feature_type      text not null check (feature_type in ('fence', 'electric_fence', 'pipe', 'trough', 'tank', 'dam',
                                                          'gate', 'yard', 'electric_unit', 'rain_gauge', 'point', 'other')),
  name              text,
  geometry          jsonb not null,
  electric_unit_id  uuid references public.map_features (id),
  notes             text,
  archived_at       timestamptz
);
comment on column public.map_features.geometry is 'GeoJSON point or line.';
comment on column public.map_features.electric_unit_id is 'For an electric fence: the energiser it runs from (grouped by unit on the map).';
call app.setup_table('map_features');
call app.farm_user_policies('map_features');

alter table public.feed_storage_sites
  add constraint feed_storage_sites_map_feature_fk foreign key (map_feature_id) references public.map_features (id);

create table public.issues (
  id              uuid primary key default gen_random_uuid(),
  reported_at     timestamptz not null default now(),
  reported_by     uuid references public.profiles (user_id) default auth.uid(),
  categories      text[] not null default '{}',
  notes           text,
  lat             numeric(9,6),
  lng             numeric(9,6),
  gps_accuracy_m  numeric(6,1),
  property_id     uuid references public.properties (id),
  paddock_id      uuid references public.paddocks (id),
  map_feature_id  uuid references public.map_features (id),
  status          text not null default 'new' check (status in ('new', 'in_progress', 'done')),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles (user_id)
);
comment on table public.issues is 'Field reports. Date, GPS, paddock and nearest feature are filled in on the phone. Photos attach through attachment_links.';
call app.setup_table('issues');
call app.farm_user_policies('issues');

create or replace function app.issue_resolved()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    new.resolved_at := coalesce(new.resolved_at, now());
    new.resolved_by := coalesce(new.resolved_by, auth.uid());
  elsif new.status <> 'done' then
    new.resolved_at := null;
    new.resolved_by := null;
  end if;
  return new;
end $$;
create trigger issues_resolved before update of status on public.issues
  for each row execute function app.issue_resolved();

create table public.readings (
  id              uuid primary key default gen_random_uuid(),
  source          text not null default 'manual' check (source in ('manual', 'sensor', 'satellite')),
  measure         text not null,
  value           numeric(12,3) not null,
  observed_at     timestamptz not null default now(),
  property_id     uuid references public.properties (id),
  paddock_id      uuid references public.paddocks (id),
  map_feature_id  uuid references public.map_features (id),
  external_ref    text
);
comment on column public.readings.measure is 'e.g. rainfall_mm now; later tank_level_pct, ndvi_mean.';
create index readings_lookup on public.readings (measure, observed_at);
call app.setup_table('readings');
call app.farm_user_policies('readings');

create table public.vehicles (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  vehicle_type   text,
  rego           text,
  serial_number  text,
  reading_unit   text not null default 'km' check (reading_unit in ('km', 'hours')),
  notes          text,
  archived_at    timestamptz
);
call app.setup_table('vehicles');
call app.farm_user_policies('vehicles');

create table public.vehicle_services (
  id                uuid primary key default gen_random_uuid(),
  service_date      date not null default current_date,
  vehicle_id        uuid not null references public.vehicles (id),
  reading           numeric(10,1),
  service_type      text,
  work_done         text[] not null default '{}',
  work_done_other   text,
  parts_used        text,
  done_by           text,
  next_due_date     date,
  next_due_reading  numeric(10,1),
  notes             text
);
comment on column public.vehicle_services.work_done is 'The checkboxes. Values come from the vehicle_work_done pick list. Cost is in record_prices.';
call app.setup_table('vehicle_services');
call app.farm_user_policies('vehicle_services');

create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  document_kind  text not null check (document_kind in ('biosecurity_plan', 'property_risk_assessment', 'welfare_plan',
                                                        'soil_test', 'agronomist_report', 'feed_test', 'other')),
  document_date  date,
  review_due     date,
  notes          text
);
comment on table public.documents is 'Files and links to paddocks or records go through attachment_links.';
call app.setup_table('documents');
call app.farm_user_policies('documents');

-- ------------------------------------------------------------
-- Views.
-- ------------------------------------------------------------

create view public.vehicle_history with (security_invoker = true) as
select distinct on (v.id)
       v.id as vehicle_id, v.name, v.reading_unit,
       s.service_date as last_service_date, s.reading as last_reading, s.work_done as last_work_done,
       s.next_due_date, s.next_due_reading
from public.vehicles v
left join public.vehicle_services s on s.vehicle_id = v.id and s.deleted_at is null
where v.deleted_at is null and v.archived_at is null
order by v.id, s.service_date desc nulls last, s.created_at desc;

create view public.open_issues with (security_invoker = true) as
select * from public.issues where deleted_at is null and status <> 'done';

insert into public.schema_migrations (version, applied_by) values ('0007_map_vehicles_documents', current_user);
