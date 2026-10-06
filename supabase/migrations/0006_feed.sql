-- ============================================================
-- Farm Records v2 · 0006 Feed
--
-- Level 1: feed inventory. Storage sites, feed items, lots (one per
--          purchase or on-farm harvest) and a ledger, like chemicals.
-- Level 2: rations per mob, and feeding events ("fed mob X today")
--          that draw down the inventory.
-- Medicated feeds and licks can carry a WHP/ESI: feeding one puts
-- the mob under withhold exactly like a treatment.
-- ============================================================

create table public.feed_storage_sites (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid references public.properties (id),
  name            text not null,
  site_type       text not null check (site_type in ('hay_shed', 'silo', 'bunker_pit', 'other')),
  capacity        numeric(12,2),
  capacity_unit   text,
  map_feature_id  uuid,               -- FK added in 0007 once map_features exists
  archived_at     timestamptz
);
call app.setup_table('feed_storage_sites');
call app.farm_user_policies('feed_storage_sites');

create table public.feed_items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  feed_type    text not null check (feed_type in ('hay', 'silage', 'grain', 'pellets', 'supplement_lick', 'other')),
  unit         text not null check (unit in ('round_bale', 'square_bale', 't', 'kg')),
  kg_per_unit  numeric(8,1),
  whp_days     int,
  esi_days     int,
  archived_at  timestamptz
);
comment on column public.feed_items.kg_per_unit is 'Bales only: lets rations in kg draw down bales. t = 1000 and kg = 1 automatically.';
call app.setup_table('feed_items');
call app.farm_user_policies('feed_items');

create table public.feed_lots (
  id                        uuid primary key default gen_random_uuid(),
  feed_item_id              uuid not null references public.feed_items (id),
  source                    text not null check (source in ('purchased', 'produced_on_farm')),
  supplier_contact_id       uuid references public.contacts (id),
  produced_from_paddock_id  uuid references public.paddocks (id),
  received_date             date not null default current_date,
  dry_matter_pct            numeric(5,2),
  me_mj_kg                  numeric(5,2),
  crude_protein_pct         numeric(5,2),
  notes                     text
);
comment on table public.feed_lots is 'The Commodity Vendor Declaration and any feed test attach through attachment_links.';
call app.setup_table('feed_lots');
call app.farm_user_policies('feed_lots');

create table public.rations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  notes        text,
  archived_at  timestamptz
);
call app.setup_table('rations');
call app.farm_user_policies('rations');

create table public.ration_items (
  id                    uuid primary key default gen_random_uuid(),
  ration_id             uuid not null references public.rations (id),
  feed_item_id          uuid not null references public.feed_items (id),
  kg_per_head_per_day   numeric(8,2) not null
);
call app.setup_table('ration_items');
call app.farm_user_policies('ration_items');

create table public.ration_assignments (
  id          uuid primary key default gen_random_uuid(),
  ration_id   uuid not null references public.rations (id),
  mob_id      uuid not null references public.mobs (id),
  start_date  date not null default current_date,
  end_date    date
);
call app.setup_table('ration_assignments');
call app.farm_user_policies('ration_assignments');

create table public.feeding_events (
  id          uuid primary key default gen_random_uuid(),
  feed_date   date not null default current_date,
  mob_id      uuid not null references public.mobs (id),
  ration_id   uuid references public.rations (id),
  head_fed    int,
  paddock_id  uuid references public.paddocks (id),
  notes       text
);
create index feeding_events_mob on public.feeding_events (mob_id, feed_date);
call app.setup_table('feeding_events');
call app.farm_user_policies('feeding_events');

create table public.feed_ledger (
  id                uuid primary key default gen_random_uuid(),
  feed_lot_id       uuid not null references public.feed_lots (id),
  storage_site_id   uuid references public.feed_storage_sites (id),
  entry_date        date not null default current_date,
  entry_type        text not null check (entry_type in ('purchased', 'produced', 'fed_out', 'written_off',
                                                        'stocktake_adjustment', 'moved_between_sites')),
  quantity          numeric(14,3) not null,
  write_off_reason  text check (write_off_reason in ('spoiled', 'wet', 'vermin', 'other')),
  feeding_event_id  uuid references public.feeding_events (id),
  notes             text,
  check (entry_type <> 'written_off' or write_off_reason is not null),
  check (entry_type <> 'fed_out' or feeding_event_id is not null)
);
comment on column public.feed_ledger.quantity is 'In the feed item''s unit. Plus in, minus out. Prices are in record_prices.';
call app.setup_table('feed_ledger');
call app.farm_user_policies('feed_ledger');

-- Deleting or re-dating a feeding event carries to its ledger lines.
create or replace function app.feeding_event_follow()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if new.deleted_at is distinct from old.deleted_at or new.feed_date is distinct from old.feed_date then
    update public.feed_ledger
       set deleted_at = new.deleted_at, entry_date = new.feed_date
     where feeding_event_id = new.id
       and (deleted_at is distinct from new.deleted_at or entry_date is distinct from new.feed_date);
  end if;
  return null;
end $$;
create trigger feeding_events_follow after update on public.feeding_events
  for each row execute function app.feeding_event_follow();

-- ------------------------------------------------------------
-- Withholds now come from treatments AND medicated feed.
-- (Replaces the 0003 views, adding source_table / source_id.)
-- ------------------------------------------------------------

drop view public.active_withholds;
drop view public.mob_withholds;

create view public.mob_withholds with (security_invoker = true) as
with recursive w (mob_id, source_table, source_id, product_name, whp_until, esi_until, effective_from) as (
  select t.mob_id, 'treatment_items'::text, i.id, p.name, i.whp_until, i.esi_until, t.treatment_date
  from public.treatment_items i
  join public.treatments t on t.id = i.treatment_id
  join public.products p on p.id = i.product_id
  where t.mob_id is not null
    and i.deleted_at is null and t.deleted_at is null
    and (i.whp_until is not null or i.esi_until is not null)
  union
  select distinct fe.mob_id, 'feeding_events'::text, fe.id, fi.name,
         fe.feed_date + fi.whp_days, fe.feed_date + fi.esi_days, fe.feed_date
  from public.feeding_events fe
  join public.feed_ledger fl on fl.feeding_event_id = fe.id and fl.deleted_at is null
  join public.feed_lots lot on lot.id = fl.feed_lot_id
  join public.feed_items fi on fi.id = lot.feed_item_id
  where fe.deleted_at is null and (fi.whp_days is not null or fi.esi_days is not null)
  union
  select dst.mob_id, w.source_table, w.source_id, w.product_name, w.whp_until, w.esi_until, e.event_date
  from w
  join public.stock_event_lines src on src.mob_id = w.mob_id and src.head_change < 0 and src.deleted_at is null
  join public.stock_events e on e.id = src.stock_event_id and e.deleted_at is null
                             and e.event_type in ('split', 'merge', 'transfer_between_mobs', 'weaning')
  join public.stock_event_lines dst on dst.stock_event_id = e.id and dst.head_change > 0 and dst.deleted_at is null
                                    and dst.mob_id <> w.mob_id
                                    and coalesce(dst.withhold_choice, 'applied') = 'applied'
  where e.event_date >= w.effective_from
    and e.event_date <= greatest(w.whp_until, w.esi_until)
)
select * from w;

create view public.active_withholds with (security_invoker = true) as
select mob_id,
       max(whp_until) filter (where whp_until >= current_date) as whp_until,
       max(esi_until) filter (where esi_until >= current_date) as esi_until,
       string_agg(distinct product_name, ', ') as products
from public.mob_withholds
where effective_from <= current_date
  and (whp_until >= current_date or esi_until >= current_date)
group by mob_id;

-- A medicated feed-out that syncs after a sale re-checks exits too.
create or replace function app.feed_ledger_recheck_exits()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  f   record;
  ev  record;
begin
  if new.feeding_event_id is null then
    return null;
  end if;
  select fe.feed_date, fi.whp_days, fi.esi_days into f
  from public.feeding_events fe
  join public.feed_lots lot on lot.id = new.feed_lot_id
  join public.feed_items fi on fi.id = lot.feed_item_id
  where fe.id = new.feeding_event_id;
  if f.whp_days is null and f.esi_days is null then
    return null;
  end if;
  for ev in
    select id from public.stock_events
     where event_type = 'exit' and deleted_at is null
       and event_date >= f.feed_date
       and event_date <= f.feed_date + greatest(coalesce(f.whp_days, 0), coalesce(f.esi_days, 0))
  loop
    perform app.check_exit_withholds(ev.id);
  end loop;
  return null;
end $$;
create trigger feed_ledger_recheck_exits after insert or update on public.feed_ledger
  for each row execute function app.feed_ledger_recheck_exits();

-- ------------------------------------------------------------
-- Feed on hand and days remaining.
-- ------------------------------------------------------------

create or replace function app.kg_per_unit(p_unit text, p_kg_per_unit numeric)
returns numeric language sql immutable as $$
  select case p_unit when 't' then 1000 when 'kg' then 1 else p_kg_per_unit end
$$;

create view public.feed_on_hand with (security_invoker = true) as
select l.feed_lot_id, lot.feed_item_id, fi.name as feed_name, fi.unit, l.storage_site_id,
       sum(l.quantity) as on_hand,
       sum(l.quantity) * app.kg_per_unit(fi.unit, fi.kg_per_unit) as on_hand_kg
from public.feed_ledger l
join public.feed_lots lot on lot.id = l.feed_lot_id
join public.feed_items fi on fi.id = lot.feed_item_id
where l.deleted_at is null and lot.deleted_at is null
group by l.feed_lot_id, lot.feed_item_id, fi.name, fi.unit, fi.kg_per_unit, l.storage_site_id;

-- Daily use of each feed item from rations assigned today, times current head.
create view public.feed_daily_use with (security_invoker = true) as
select ri.feed_item_id, sum(ri.kg_per_head_per_day * greatest(t.head, 0)) as kg_per_day
from public.ration_assignments ra
join public.ration_items ri on ri.ration_id = ra.ration_id and ri.deleted_at is null
join public.mob_totals t on t.mob_id = ra.mob_id
where ra.deleted_at is null
  and ra.start_date <= current_date
  and (ra.end_date is null or ra.end_date >= current_date)
group by ri.feed_item_id;

create view public.feed_days_remaining with (security_invoker = true) as
select fi.id as feed_item_id, fi.name as feed_name,
       coalesce(sum(oh.on_hand_kg), 0) as on_hand_kg,
       u.kg_per_day,
       case when u.kg_per_day > 0 then floor(coalesce(sum(oh.on_hand_kg), 0) / u.kg_per_day)::int end as days_left
from public.feed_items fi
join public.feed_daily_use u on u.feed_item_id = fi.id
left join public.feed_on_hand oh on oh.feed_item_id = fi.id
where fi.deleted_at is null
group by fi.id, fi.name, u.kg_per_day;

insert into public.schema_migrations (version, applied_by) values ('0006_feed', current_user);
