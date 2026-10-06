-- ============================================================
-- Farm Records v2 · 0001 Foundation
--
-- Helpers used by every other migration, plus the farm setup
-- tables (settings, people, contacts, properties, paddocks,
-- pick lists, livestock classes) and the system tables (files,
-- prices, change log, alerts, imports).
--
-- Rules this file sets up (see SCHEMA.md, Part 1):
--   * Everything can be edited. Every earlier version is kept in
--     change_log by a trigger.
--   * Nothing is ever really deleted. "Delete" sets deleted_at.
--   * Prices live only in record_prices, which only owners can see.
--   * Roles: owner, staff, contractor.
-- ============================================================

create schema if not exists app;
comment on schema app is 'Private helper functions. Not exposed through the API.';

-- ------------------------------------------------------------
-- Who is logged in, and what role do they have?
-- ------------------------------------------------------------

create table public.profiles (
  user_id      uuid primary key references auth.users (id),
  full_name    text not null,
  phone        text,
  role         text not null check (role in ('owner', 'staff', 'contractor')),
  contact_id   uuid,                 -- contractors: their business (FK added below)
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  updated_by   uuid
);
comment on table public.profiles is 'One row per login. Role decides what the person can see and do.';

create or replace function app.my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid() and active
$$;

create or replace function app.is_owner()
returns boolean language sql stable as $$ select coalesce(app.my_role() = 'owner', false) $$;

create or replace function app.is_farm_user()
returns boolean language sql stable as $$ select coalesce(app.my_role() in ('owner', 'staff'), false) $$;

create or replace function app.is_contractor()
returns boolean language sql stable as $$ select coalesce(app.my_role() = 'contractor', false) $$;

-- ------------------------------------------------------------
-- The change log: every earlier version of every record.
-- ------------------------------------------------------------

create table public.change_log (
  id             bigint generated always as identity primary key,
  table_name     text not null,
  row_id         uuid not null,
  action         text not null check (action in ('insert', 'update', 'delete', 'restore', 'archive')),
  old_values     jsonb,
  new_values     jsonb,
  edit_reason    text,
  changed_by     uuid,
  changed_at     timestamptz not null default now(),
  edit_conflict  boolean not null default false
);
create index change_log_row on public.change_log (table_name, row_id, changed_at);
comment on table public.change_log is 'Every insert, edit, delete and restore, with the full row before and after. Written by trigger only.';

-- ------------------------------------------------------------
-- Standard columns and behaviour, added to every table with
-- app.setup_table('table_name').
-- ------------------------------------------------------------

-- Before insert: stamp who and when.
create or replace function app.stamp_insert()
returns trigger language plpgsql as $$
begin
  new.created_at := coalesce(new.created_at, now());
  new.created_by := coalesce(new.created_by, auth.uid());
  new.synced_at  := now();
  return new;
end $$;

-- Before update: stamp who and when, protect the original stamps,
-- and flag an edit made from an out-of-date copy (two offline phones).
create or replace function app.stamp_update()
returns trigger language plpgsql as $$
begin
  new.id         := old.id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.updated_by := auth.uid();
  -- A reason only belongs to the edit it was given with.
  if new.edit_reason is not distinct from old.edit_reason then
    new.edit_reason := null;
  end if;
  -- The app sends edit_base_updated_at = the updated_at of the copy it
  -- edited. If someone else saved since, this edit is a conflict.
  if new.edit_base_updated_at is distinct from old.edit_base_updated_at
     and new.edit_base_updated_at is not null
     and old.updated_at is not null
     and new.edit_base_updated_at < old.updated_at then
    new.has_edit_conflict := true;
  end if;
  return new;
end $$;

-- After insert or update: copy the before and after rows into change_log.
create or replace function app.log_change()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
  elsif old.deleted_at is null and new.deleted_at is not null then
    v_action := 'delete';
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'restore';
  elsif to_jsonb(old) ? 'archived_at'
        and (to_jsonb(old) ->> 'archived_at') is null
        and (to_jsonb(new) ->> 'archived_at') is not null then
    v_action := 'archive';
  else
    v_action := 'update';
  end if;

  insert into public.change_log (table_name, row_id, action, old_values, new_values, edit_reason, changed_by, edit_conflict)
  values (
    tg_table_name,
    new.id,
    v_action,
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new),
    new.edit_reason,
    auth.uid(),
    coalesce(new.has_edit_conflict, false) and tg_op = 'UPDATE'
  );
  return null;
end $$;

-- Real deletes are never allowed. The app sets deleted_at instead.
create or replace function app.block_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Records are never deleted in Farm Records. Set deleted_at instead (table %).', tg_table_name
    using errcode = 'P0001';
end $$;

-- Adds the standard columns and triggers to a table.
create or replace procedure app.setup_table(p_table text)
language plpgsql as $$
begin
  execute format($f$
    alter table public.%1$I
      add column if not exists created_at            timestamptz not null default now(),
      add column if not exists created_by            uuid,
      add column if not exists recorded_at           timestamptz,
      add column if not exists synced_at             timestamptz,
      add column if not exists device_id             text,
      add column if not exists updated_at            timestamptz,
      add column if not exists updated_by            uuid,
      add column if not exists edit_reason           text,
      add column if not exists edit_base_updated_at  timestamptz,
      add column if not exists has_edit_conflict     boolean not null default false,
      add column if not exists deleted_at            timestamptz
  $f$, p_table);

  execute format('create trigger %1$s_stamp_insert before insert on public.%1$I for each row execute function app.stamp_insert()', p_table);
  execute format('create trigger %1$s_stamp_update before update on public.%1$I for each row execute function app.stamp_update()', p_table);
  execute format('create trigger %1$s_log after insert or update on public.%1$I for each row execute function app.log_change()', p_table);
  execute format('create trigger %1$s_no_delete before delete on public.%1$I for each row execute function app.block_delete()', p_table);

  execute format('alter table public.%I enable row level security', p_table);
  execute format('revoke delete on public.%I from anon, authenticated', p_table);
end $$;

-- The usual access rule: owners and staff can read, add and edit.
-- Contractors get nothing unless a table adds its own policy.
create or replace procedure app.farm_user_policies(p_table text)
language plpgsql as $$
begin
  execute format('create policy farm_users_read on public.%I for select to authenticated using (app.is_farm_user())', p_table);
  execute format('create policy farm_users_add on public.%I for insert to authenticated with check (app.is_farm_user())', p_table);
  execute format('create policy farm_users_edit on public.%I for update to authenticated using (app.is_farm_user()) with check (app.is_farm_user())', p_table);
end $$;

-- ------------------------------------------------------------
-- Farm settings (one row).
-- ------------------------------------------------------------

create table public.farm_settings (
  id                    uuid primary key default gen_random_uuid(),
  only_one_row          boolean not null default true unique check (only_one_row),
  farm_name             text not null default 'My farm',
  tier                  int  not null default 1 check (tier in (1, 2, 3)),
  time_zone             text not null default 'Australia/Sydney',
  lpa_template_version  text not null default 'ISC LPA-02 livestock treatment record',
  gestation_days        jsonb not null default '{"cattle": 283, "sheep": 150, "goat": 150}',
  voice_entry_enabled   boolean not null default false
);
call app.setup_table('farm_settings');
create policy farm_users_read on public.farm_settings for select to authenticated using (app.is_farm_user() or app.is_contractor());
create policy owners_edit on public.farm_settings for update to authenticated using (app.is_owner()) with check (app.is_owner());
insert into public.farm_settings default values;

-- ------------------------------------------------------------
-- Contacts: vendors, buyers, agents, carriers, contractors, vets,
-- agistment partners.
-- ------------------------------------------------------------

create table public.contacts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  business_name   text,
  kinds           text[] not null default '{}',
  phone           text,
  email           text,
  pic             text,
  licence_number  text,
  notes           text,
  archived_at     timestamptz
);
call app.setup_table('contacts');
call app.farm_user_policies('contacts');

alter table public.profiles
  add constraint profiles_contact_fk foreign key (contact_id) references public.contacts (id);

-- Profiles: everyone can read their own; owners manage everyone's.
alter table public.profiles enable row level security;
create policy read_own_or_owner on public.profiles for select to authenticated
  using (user_id = auth.uid() or app.is_farm_user());
create policy owners_add on public.profiles for insert to authenticated with check (app.is_owner());
create policy owners_edit on public.profiles for update to authenticated using (app.is_owner()) with check (app.is_owner());
revoke delete on public.profiles from anon, authenticated;

-- ------------------------------------------------------------
-- Properties (own and outside) and paddocks.
-- ------------------------------------------------------------

create table public.properties (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  pic            text,
  address        text,
  is_own         boolean not null default true,
  contact_id     uuid references public.contacts (id),
  centre_lat     numeric(9,6),
  centre_lng     numeric(9,6),
  default_zoom   int,
  notes          text,
  archived_at    timestamptz
);
comment on column public.properties.is_own is 'false for agistment and other outside properties (e.g. a regular buyer''s PIC).';
call app.setup_table('properties');
call app.farm_user_policies('properties');

create table public.paddocks (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.properties (id),
  name             text not null,
  boundary         jsonb,
  area_ha          numeric(10,2),
  area_overridden  boolean not null default false,
  notes            text,
  archived_at      timestamptz,
  unique (id, property_id)
);
comment on column public.paddocks.boundary is 'GeoJSON polygon drawn on the map. Area is worked out on the phone.';
call app.setup_table('paddocks');
call app.farm_user_policies('paddocks');

-- ------------------------------------------------------------
-- Pick lists (simple editable dropdowns) and livestock classes.
-- ------------------------------------------------------------

create table public.pick_lists (
  id           uuid primary key default gen_random_uuid(),
  list_name    text not null,
  value        text not null,
  sort_order   int not null default 0,
  archived_at  timestamptz,
  unique (list_name, value)
);
call app.setup_table('pick_lists');
create policy farm_users_read on public.pick_lists for select to authenticated using (app.is_farm_user() or app.is_contractor());
create policy farm_users_add on public.pick_lists for insert to authenticated with check (app.is_farm_user());
create policy farm_users_edit on public.pick_lists for update to authenticated using (app.is_farm_user()) with check (app.is_farm_user());

create table public.livestock_classes (
  id           uuid primary key default gen_random_uuid(),
  species      text not null check (species in ('cattle', 'sheep', 'goat', 'other')),
  name         text not null,
  sex          text check (sex in ('male', 'female', 'mixed', 'castrate')),
  sort_order   int not null default 0,
  archived_at  timestamptz,
  unique (species, name)
);
call app.setup_table('livestock_classes');
call app.farm_user_policies('livestock_classes');

-- ------------------------------------------------------------
-- Files. The file itself is in Supabase Storage; this is its record.
-- attachment_links joins a file to any record.
-- ------------------------------------------------------------

create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint
);
call app.setup_table('attachments');
call app.farm_user_policies('attachments');

create table public.attachment_links (
  id             uuid primary key default gen_random_uuid(),
  attachment_id  uuid not null references public.attachments (id),
  record_table   text not null,
  record_id      uuid not null
);
create index attachment_links_record on public.attachment_links (record_table, record_id);
call app.setup_table('attachment_links');
call app.farm_user_policies('attachment_links');

-- ------------------------------------------------------------
-- Prices and costs. OWNERS ONLY. Kept out of the main tables
-- because row-level security hides whole rows, not columns.
-- ------------------------------------------------------------

create table public.record_prices (
  id              uuid primary key default gen_random_uuid(),
  record_table    text not null,
  record_id       uuid not null,
  price_per_head  numeric(12,2),
  price_per_kg    numeric(12,4),
  total_amount    numeric(12,2),
  notes           text,
  unique (record_table, record_id)
);
comment on table public.record_prices is 'Every price and cost, including GST. Owner role only.';
call app.setup_table('record_prices');
create policy owners_read on public.record_prices for select to authenticated using (app.is_owner());
create policy owners_add on public.record_prices for insert to authenticated with check (app.is_owner());
create policy owners_edit on public.record_prices for update to authenticated using (app.is_owner()) with check (app.is_owner());

-- change_log: read-only to farm users; price history to owners only.
alter table public.change_log enable row level security;
create policy farm_users_read on public.change_log for select to authenticated
  using (app.is_owner() or (app.is_farm_user() and table_name <> 'record_prices'));
revoke insert, update, delete on public.change_log from anon, authenticated;

-- ------------------------------------------------------------
-- Imports (CSV, RFID wand sessions, AgriWebb, Mobble, v1 Sheets).
-- ------------------------------------------------------------

create table public.import_batches (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,
  file_name       text,
  rows_read       int,
  rows_imported   int,
  rows_rejected   int,
  notes           text
);
call app.setup_table('import_batches');
call app.farm_user_policies('import_batches');

-- ------------------------------------------------------------
-- Alerts: messages for particular people (reminders are for all).
-- ------------------------------------------------------------

create table public.alerts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (user_id),
  severity         text not null default 'normal' check (severity in ('urgent', 'normal')),
  message          text not null,
  record_table     text,
  record_id        uuid,
  read_at          timestamptz,
  resolved_at      timestamptz,
  resolved_by      uuid,
  resolution_note  text
);
call app.setup_table('alerts');
create policy own_or_owner_read on public.alerts for select to authenticated
  using (user_id = auth.uid() or app.is_owner());
create policy own_or_owner_edit on public.alerts for update to authenticated
  using (user_id = auth.uid() or app.is_owner()) with check (user_id = auth.uid() or app.is_owner());
-- Alerts are created by database rules (security definer), not by the app directly.

-- Sends one alert to every active owner, plus one extra person if given.
create or replace function app.alert_owners(p_message text, p_severity text, p_table text, p_id uuid, p_also_user uuid default null)
returns void language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.alerts (user_id, severity, message, record_table, record_id)
  select p.user_id, p_severity, p_message, p_table, p_id
  from public.profiles p
  where p.active and (p.role = 'owner' or p.user_id = p_also_user);
end $$;

-- ------------------------------------------------------------
-- Schema version, for the update tooling.
-- ------------------------------------------------------------

create table public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now(),
  applied_by  text
);
alter table public.schema_migrations enable row level security;
create policy farm_users_read on public.schema_migrations for select to authenticated using (app.is_farm_user());
revoke insert, update, delete on public.schema_migrations from anon, authenticated;

-- Logged-in users need to run the helper functions inside policies.
-- The app schema is not exposed through the API, so they can't call
-- these directly from the app.
grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;
alter default privileges in schema app grant execute on functions to authenticated;

insert into public.schema_migrations (version, applied_by) values ('0001_foundation', current_user);
