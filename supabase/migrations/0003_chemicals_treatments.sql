-- ============================================================
-- Farm Records v2 · 0003 Chemicals, treatments and withholds
--
-- * Chemical stock is a ledger: received, used, written off,
--   stocktake. On hand = the sum. Using a product on a treatment
--   writes its own ledger line.
-- * Treatments follow the ISC LPA livestock treatment record.
-- * Withholds follow the stock through splits and merges when the
--   user chose to apply them.
-- * A sale or slaughter inside a withhold is never refused (the
--   stock are already gone). With no override reason it is flagged
--   needs_review and an urgent alert goes to every owner and the
--   person who recorded it.
--
-- Withhold dates: whp_until / esi_until are the LAST day under
-- withhold (treatment date + days). Stock are clear the day after.
-- WHP and ESI values are entered by the farmer from the label.
-- ============================================================

create table public.products (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  product_kind             text not null check (product_kind in ('animal_treatment', 'spray', 'fertiliser', 'other')),
  active_constituent       text,
  chemical_group           text,
  apvma_number             text,
  stock_unit               text not null default 'mL' check (stock_unit in ('mL', 'L', 'g', 'kg', 't', 'dose')),
  label_whp_days           int,
  label_esi_days           int,
  label_grazing_whp_days   int,
  label_harvest_whp_days   int,
  default_dose_rate        text,
  default_route            text,
  track_stock              boolean not null default true,
  notes                    text,
  archived_at              timestamptz
);
comment on column public.products.label_whp_days is 'Entered by the farmer from the product label, which is the source of truth.';
call app.setup_table('products');
call app.farm_user_policies('products');
create policy contractors_read on public.products for select to authenticated
  using (app.is_contractor() and product_kind in ('spray', 'fertiliser'));

create table public.product_batches (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products (id),
  batch_number      text,
  expiry_date       date,
  storage_location  text
);
call app.setup_table('product_batches');
call app.farm_user_policies('product_batches');
create policy contractors_read on public.product_batches for select to authenticated
  using (app.is_contractor() and exists (
    select 1 from public.products p where p.id = product_id and p.product_kind in ('spray', 'fertiliser')));

create table public.chemical_ledger (
  id                   uuid primary key default gen_random_uuid(),
  batch_id             uuid not null references public.product_batches (id),
  entry_date           date not null default current_date,
  entry_type           text not null check (entry_type in ('received', 'used', 'written_off', 'stocktake_adjustment')),
  quantity             numeric(14,3) not null,
  write_off_reason     text check (write_off_reason in ('expired', 'leaked_spilled', 'damaged', 'disposed', 'returned', 'other')),
  supplier_contact_id  uuid references public.contacts (id),
  source_table         text,
  source_id            uuid,
  quick_added          boolean not null default false,
  notes                text,
  check (entry_type <> 'written_off' or write_off_reason is not null)
);
comment on column public.chemical_ledger.quantity is 'Plus for received, minus for used and written off. In the product''s stock_unit.';
create unique index chemical_ledger_source on public.chemical_ledger (source_table, source_id) where source_id is not null;
call app.setup_table('chemical_ledger');
call app.farm_user_policies('chemical_ledger');

-- ------------------------------------------------------------
-- Treatments.
-- ------------------------------------------------------------

create table public.treatments (
  id                            uuid primary key default gen_random_uuid(),
  treatment_date                date not null default current_date,
  property_id                   uuid references public.properties (id),
  paddock_id                    uuid references public.paddocks (id),
  mob_id                        uuid references public.mobs (id),
  head_treated                  int,
  livestock_description         text,
  treated_by_user_id            uuid references public.profiles (user_id),
  treated_by_name               text,
  treated_by_phone              text,
  equipment_cleaned_calibrated  boolean,
  equipment_cleaned_by          text,
  import_batch_id               uuid references public.import_batches (id),
  notes                         text
);
create index treatments_mob on public.treatments (mob_id, treatment_date);
call app.setup_table('treatments');
call app.farm_user_policies('treatments');

create table public.treatment_items (
  id                     uuid primary key default gen_random_uuid(),
  treatment_id           uuid not null references public.treatments (id),
  product_id             uuid not null references public.products (id),
  batch_id               uuid references public.product_batches (id),
  not_from_inventory     boolean not null default false,
  dose_rate              text,
  approx_live_weight_kg  numeric(8,1),
  route                  text,
  quantity_used          numeric(14,3),
  reason                 text,
  whp_days               int,
  esi_days               int,
  whp_until              date,
  esi_until              date,
  adverse_reactions      text,
  broken_needle          boolean
);
create index treatment_items_treatment on public.treatment_items (treatment_id);
call app.setup_table('treatment_items');
call app.farm_user_policies('treatment_items');

create table public.treatment_animals (
  id            uuid primary key default gen_random_uuid(),
  treatment_id  uuid not null references public.treatments (id),
  animal_id     uuid not null references public.animals (id)
);
call app.setup_table('treatment_animals');
call app.farm_user_policies('treatment_animals');

-- Fill in withhold dates and the "not from inventory" flag.
create or replace function app.treatment_item_defaults()
returns trigger language plpgsql as $$
declare
  v_date date;
begin
  select treatment_date into v_date from public.treatments where id = new.treatment_id;
  if new.whp_days is not null and (new.whp_until is null or tg_op = 'UPDATE' and new.whp_days is distinct from old.whp_days and new.whp_until is not distinct from old.whp_until) then
    new.whp_until := v_date + new.whp_days;
  end if;
  if new.esi_days is not null and (new.esi_until is null or tg_op = 'UPDATE' and new.esi_days is distinct from old.esi_days and new.esi_until is not distinct from old.esi_until) then
    new.esi_until := v_date + new.esi_days;
  end if;
  new.not_from_inventory := new.batch_id is null;
  return new;
end $$;
create trigger treatment_items_defaults before insert or update on public.treatment_items
  for each row execute function app.treatment_item_defaults();

-- Moving a treatment's date moves the withhold dates of its items
-- (unless an item's dates were typed in by hand).
create or replace function app.treatment_date_changed()
returns trigger language plpgsql as $$
begin
  if new.treatment_date is distinct from old.treatment_date then
    update public.treatment_items i
       set whp_until = case when i.whp_days is not null and i.whp_until = old.treatment_date + i.whp_days then new.treatment_date + i.whp_days else i.whp_until end,
           esi_until = case when i.esi_days is not null and i.esi_until = old.treatment_date + i.esi_days then new.treatment_date + i.esi_days else i.esi_until end
     where i.treatment_id = new.id;
  end if;
  return null;
end $$;
create trigger treatments_date_changed after update of treatment_date on public.treatments
  for each row execute function app.treatment_date_changed();

-- ------------------------------------------------------------
-- Usage ledger lines written by the records that use chemicals.
-- Called by triggers on treatment_items here, and on spray and
-- pasture items in later migrations.
-- ------------------------------------------------------------

create or replace function app.sync_usage(p_source_table text, p_source_id uuid, p_batch uuid, p_quantity numeric,
                                          p_date date, p_deleted_at timestamptz)
returns void language plpgsql security definer
set search_path = public
as $$
begin
  if p_batch is null or p_quantity is null then
    update public.chemical_ledger set deleted_at = coalesce(deleted_at, now())
     where source_table = p_source_table and source_id = p_source_id and deleted_at is null;
    return;
  end if;

  insert into public.chemical_ledger (batch_id, entry_date, entry_type, quantity, source_table, source_id, deleted_at)
  values (p_batch, p_date, 'used', -abs(p_quantity), p_source_table, p_source_id, p_deleted_at)
  on conflict (source_table, source_id) where source_id is not null do update
     set batch_id = excluded.batch_id,
         entry_date = excluded.entry_date,
         quantity = excluded.quantity,
         deleted_at = excluded.deleted_at
   where (chemical_ledger.batch_id, chemical_ledger.entry_date, chemical_ledger.quantity, chemical_ledger.deleted_at)
         is distinct from (excluded.batch_id, excluded.entry_date, excluded.quantity, excluded.deleted_at);
end $$;

create or replace function app.treatment_item_usage()
returns trigger language plpgsql as $$
declare
  t record;
begin
  select treatment_date, deleted_at into t from public.treatments where id = new.treatment_id;
  perform app.sync_usage('treatment_items', new.id, new.batch_id, new.quantity_used,
                         t.treatment_date, coalesce(new.deleted_at, t.deleted_at));
  return null;
end $$;
create trigger treatment_items_usage after insert or update on public.treatment_items
  for each row execute function app.treatment_item_usage();

-- Deleting, restoring or re-dating a treatment carries to its usage lines.
create or replace function app.treatment_usage_follow()
returns trigger language plpgsql as $$
declare
  i record;
begin
  if new.deleted_at is distinct from old.deleted_at or new.treatment_date is distinct from old.treatment_date then
    for i in select * from public.treatment_items where treatment_id = new.id loop
      perform app.sync_usage('treatment_items', i.id, i.batch_id, i.quantity_used,
                             new.treatment_date, coalesce(i.deleted_at, new.deleted_at));
    end loop;
  end if;
  return null;
end $$;
create trigger treatments_usage_follow after update on public.treatments
  for each row execute function app.treatment_usage_follow();

-- ------------------------------------------------------------
-- Withholds per mob, including those carried through splits and
-- merges. effective_from = when this mob took on the withhold.
-- ------------------------------------------------------------

create view public.mob_withholds with (security_invoker = true) as
with recursive w (mob_id, treatment_item_id, product_name, whp_until, esi_until, effective_from) as (
  select t.mob_id, i.id, p.name, i.whp_until, i.esi_until, t.treatment_date
  from public.treatment_items i
  join public.treatments t on t.id = i.treatment_id
  join public.products p on p.id = i.product_id
  where t.mob_id is not null
    and i.deleted_at is null and t.deleted_at is null
    and (i.whp_until is not null or i.esi_until is not null)
  union
  select dst.mob_id, w.treatment_item_id, w.product_name, w.whp_until, w.esi_until, e.event_date
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

-- ------------------------------------------------------------
-- The exit check: is a sale or slaughter inside a withhold?
-- ------------------------------------------------------------

create or replace function app.check_exit_withholds(p_event uuid)
returns void language plpgsql security definer
set search_path = public
as $$
declare
  e        record;
  hit      record;
  v_head   int;
  v_mob    text;
begin
  select * into e from public.stock_events where id = p_event;
  if not found or e.deleted_at is not null or e.event_type <> 'exit'
     or coalesce(e.reason, '') not in ('sale', 'saleyard', 'slaughter') then
    return;
  end if;

  select w.product_name, w.whp_until, w.esi_until, l.mob_id
    into hit
  from public.stock_event_lines l
  join public.mob_withholds w on w.mob_id = l.mob_id
  where l.stock_event_id = e.id and l.head_change < 0 and l.deleted_at is null
    and w.effective_from <= e.event_date
    and (w.whp_until >= e.event_date
         or (coalesce(e.market, 'unknown') in ('export', 'unknown') and w.esi_until >= e.event_date))
  order by greatest(w.whp_until, w.esi_until) desc
  limit 1;

  if not found then
    if e.needs_review and e.withhold_override_reason is null then
      update public.stock_events set needs_review = false where id = e.id;
    end if;
    return;
  end if;

  if e.withhold_override_reason is not null or e.needs_review then
    return;
  end if;

  update public.stock_events set needs_review = true where id = e.id;

  select -sum(head_change)::int into v_head from public.stock_event_lines
   where stock_event_id = e.id and head_change < 0 and deleted_at is null;
  select name into v_mob from public.mobs where id = hit.mob_id;

  perform app.alert_owners(
    format('%s head from %s recorded as %s on %s while under %s withhold until %s. Check now.',
           v_head, v_mob, e.reason, to_char(e.event_date, 'Dy DD Mon'), hit.product_name,
           to_char(case when hit.whp_until >= e.event_date then hit.whp_until else hit.esi_until end, 'DD Mon')),
    'urgent', 'stock_events', e.id, e.created_by);
end $$;

create or replace function app.exit_line_changed()
returns trigger language plpgsql as $$
begin
  perform app.check_exit_withholds(new.stock_event_id);
  return null;
end $$;
create trigger stock_event_lines_exit_check after insert or update on public.stock_event_lines
  for each row execute function app.exit_line_changed();

create or replace function app.exit_event_changed()
returns trigger language plpgsql as $$
begin
  perform app.check_exit_withholds(new.id);
  return null;
end $$;
create trigger stock_events_exit_check
  after update of event_date, event_type, reason, market, withhold_override_reason, deleted_at on public.stock_events
  for each row execute function app.exit_event_changed();

-- A treatment that syncs AFTER a sale (two offline phones) re-checks
-- every exit in its withhold window.
create or replace function app.treatment_item_recheck_exits()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_date date;
  ev     record;
begin
  select treatment_date into v_date from public.treatments where id = new.treatment_id;
  for ev in
    select id from public.stock_events
     where event_type = 'exit' and deleted_at is null
       and event_date >= v_date
       and event_date <= greatest(new.whp_until, new.esi_until)
  loop
    perform app.check_exit_withholds(ev.id);
  end loop;
  return null;
end $$;
create trigger treatment_items_recheck_exits after insert or update on public.treatment_items
  for each row execute function app.treatment_item_recheck_exits();

-- ------------------------------------------------------------
-- Chemical stock on hand.
-- ------------------------------------------------------------

create view public.chemical_on_hand with (security_invoker = true) as
select b.id as batch_id, b.product_id, p.name as product_name, p.product_kind, p.chemical_group, p.stock_unit,
       b.batch_number, b.expiry_date,
       coalesce(sum(l.quantity) filter (where l.deleted_at is null), 0) as on_hand,
       (b.expiry_date is not null and b.expiry_date <= current_date + 30) as expiring_soon,
       (b.expiry_date is not null and b.expiry_date < current_date) as expired,
       (coalesce(sum(l.quantity) filter (where l.deleted_at is null), 0) < 0) as needs_stocktake
from public.product_batches b
join public.products p on p.id = b.product_id
left join public.chemical_ledger l on l.batch_id = b.id
where b.deleted_at is null and p.deleted_at is null
group by b.id, p.id;

insert into public.schema_migrations (version, applied_by) values ('0003_chemicals_treatments', current_user);
