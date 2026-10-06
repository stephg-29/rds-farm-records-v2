-- ============================================================
-- Farm Records v2 · 0011 Tier lock and module choices
--
-- TIER: the farm's paid tier (1, 2 or 3). LOCKED: nobody logged in
-- to the app can change it, owners included. Only Rural Data
-- Services changes it, from the Supabase SQL editor (or the service
-- key), e.g.
--     update public.farm_settings set tier = 2;
-- An upgrade switches on the modules it unlocks (the owner can
-- untick them). Every change is in change_log.
--
-- MODULES: the owner ticks which modules the farm uses. Unticked
-- modules are hidden in the app; their data is never deleted, so
-- ticking one again brings everything back. Modules above the
-- farm's tier show as locked. Core modules are always on.
-- ============================================================

create table public.modules (
  key             text primary key,
  name            text not null,
  description     text,
  min_tier        int not null default 1 check (min_tier in (1, 2, 3)),
  is_core         boolean not null default false,
  needs_any_of    text[] not null default '{}',
  sort_order      int not null default 0
);
comment on table public.modules is 'The catalogue of app modules. Same in every client database; changed only by migrations.';
comment on column public.modules.needs_any_of is 'This module can only be ticked if at least one of these modules is also ticked.';

insert into public.modules (key, name, description, min_tier, is_core, needs_any_of, sort_order) values
  ('stock',               'Stock',                    'Mobs, moves, splits, merges, counts, arrivals and exits', 1, true,  '{}', 10),
  ('paddocks',            'Properties and paddocks',  'Properties, PICs and the paddock list',                   1, true,  '{}', 20),
  ('treatments',          'Treatments',               'Animal treatments with WHP and ESI (LPA record)',         1, false, '{}', 30),
  ('chemical_inventory',  'Chemical inventory',       'Chemical stock, batches, expiry and write-offs',          1, false, '{}', 40),
  ('breeding',            'Breeding',                 'Joining, pregnancy testing, marking and weaning',         1, false, '{}', 50),
  ('feed',                'Feed',                     'Hay sheds, silos, rations and feeding',                   1, false, '{}', 60),
  ('spray',               'Spray records',            'Spray records and grazing withholds',                     1, false, '{}', 70),
  ('pasture',             'Pasture and fertiliser',   'Fertiliser and pasture improvement records',              1, false, '{}', 80),
  ('map',                 'Map',                      'Paddock map, fences, water and layers',                   1, false, '{}', 90),
  ('issues',              'Issues',                   'Report problems in the paddock with GPS and photos',      1, false, '{}', 100),
  ('vehicles',            'Vehicle maintenance',      'Vehicles, machinery and services',                        1, false, '{}', 110),
  ('documents',           'Documents',                'Plans, reports and review dates',                         1, false, '{}', 120),
  ('rainfall',            'Rainfall',                 'Rain gauge readings',                                     1, false, '{}', 130),
  ('contractor_jobs',     'Contractor jobs',          'Spray and fertiliser jobs for contractors',               1, false, '{spray,pasture}', 140),
  ('individual_animals',  'Individual animals',       'Tags, NLIS, per-animal history and RFID imports',         2, false, '{}', 150),
  ('stud',                'Stud',                     'Pedigree, EBVs and registry links',                       3, false, '{}', 160);

alter table public.modules enable row level security;
create policy everyone_read on public.modules for select to authenticated using (true);
revoke insert, update, delete on public.modules from anon, authenticated;

alter table public.farm_settings
  add column enabled_modules text[] not null default '{}',
  add column tier_changed_at timestamptz;
comment on column public.farm_settings.tier is 'LOCKED. Only Rural Data Services can change this (SQL editor or service key). Set by the licence agreement.';
comment on column public.farm_settings.enabled_modules is 'Non-core modules the owner has ticked. Core modules are always on.';

-- Start every farm with all the modules its tier allows.
update public.farm_settings s
   set enabled_modules = array(select m.key from public.modules m
                                where not m.is_core and m.min_tier <= s.tier order by m.sort_order);

create or replace function app.farm_settings_rules()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_bad   text;
  v_need  record;
begin
  -- 1. The tier is locked to everyone using the app.
  if new.tier is distinct from old.tier then
    if current_user in ('anon', 'authenticated') then
      raise exception 'The tier can only be changed by Rural Data Services.' using errcode = '42501';
    end if;
    new.tier_changed_at := now();
    -- An upgrade switches on the modules it unlocks.
    if new.tier > old.tier then
      new.enabled_modules := array(
        select distinct k from unnest(new.enabled_modules || array(
          select m.key from public.modules m
           where not m.is_core and m.min_tier > old.tier and m.min_tier <= new.tier)) as k);
    end if;
  end if;

  -- 2. Module choices must be real, non-core, and within the tier.
  new.enabled_modules := array(select distinct k from unnest(new.enabled_modules) as k order by k);

  select k into v_bad from unnest(new.enabled_modules) as k
   where not exists (select 1 from public.modules m where m.key = k and not m.is_core)
   limit 1;
  if v_bad is not null then
    raise exception 'Unknown module: %', v_bad using errcode = '22023';
  end if;

  if new.enabled_modules is distinct from old.enabled_modules then
    select m.key, m.min_tier into v_need from public.modules m
     where m.key = any (new.enabled_modules) and not (m.key = any (old.enabled_modules))
       and m.min_tier > new.tier
     limit 1;
    if found then
      raise exception '% needs Tier %. Contact Rural Data Services to upgrade.', v_need.key, v_need.min_tier
        using errcode = '42501';
    end if;
  end if;

  -- 3. Dependencies (e.g. contractor jobs need spray or pasture).
  select m.key, m.needs_any_of into v_need from public.modules m
   where m.key = any (new.enabled_modules)
     and cardinality(m.needs_any_of) > 0
     and not (m.needs_any_of && new.enabled_modules)
   limit 1;
  if found then
    raise exception '% needs one of these switched on: %', v_need.key, array_to_string(v_need.needs_any_of, ', ')
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger farm_settings_rules before update on public.farm_settings
  for each row execute function app.farm_settings_rules();

-- What the app reads to build its menus and the setup screen.
create view public.farm_modules with (security_invoker = true) as
select m.key, m.name, m.description, m.min_tier, m.is_core, m.needs_any_of, m.sort_order,
       case
         when m.is_core then 'core'
         when m.min_tier > s.tier then 'locked'
         when m.key = any (s.enabled_modules) then 'on'
         else 'off'
       end as status,
       (m.is_core or (m.min_tier <= s.tier and m.key = any (s.enabled_modules))) as visible
from public.modules m
cross join public.farm_settings s
order by m.sort_order;

insert into public.schema_migrations (version, applied_by) values ('0011_tiers_and_modules', current_user);
