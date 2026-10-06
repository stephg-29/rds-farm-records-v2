-- ============================================================
-- Farm Records v2 · 0002 Livestock
--
-- A mob is a named group of stock in one paddock on one property.
-- Several mobs can share a paddock. Every change to stock is a
-- stock_event with:
--   * count lines         (head up or down, per mob and class)
--   * location changes    (which mob ended up where)
-- Head counts and locations are ALWAYS worked out from these
-- records (views at the bottom), never typed in.
-- ============================================================

create table public.mobs (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  species           text not null check (species in ('cattle', 'sheep', 'goat', 'other')),
  owner_contact_id  uuid references public.contacts (id),
  colour            text,
  notes             text,
  archived_at       timestamptz
);
comment on column public.mobs.owner_contact_id is 'null = owned by the farm. Set for agisted-in or trading partner stock.';
call app.setup_table('mobs');
call app.farm_user_policies('mobs');

create table public.stock_events (
  id                        uuid primary key default gen_random_uuid(),
  event_date                date not null default current_date,
  event_type                text not null check (event_type in (
                              'paddock_move', 'split', 'merge', 'arrival', 'exit', 'death',
                              'birth_marking', 'weaning', 'reclass', 'count_adjustment',
                              'transfer_between_mobs')),
  reason                    text,
  from_property_id          uuid references public.properties (id),
  to_property_id            uuid references public.properties (id),
  counterparty_contact_id   uuid references public.contacts (id),
  nvd_number                text,
  market                    text check (market in ('domestic', 'export', 'unknown')),
  carrier_contact_id        uuid references public.contacts (id),
  truck_rego                text,
  nlis_transfer_status      text check (nlis_transfer_status in ('to_do', 'lodged', 'carrier_to_lodge', 'not_required')),
  total_weight_kg           numeric(12,1),
  average_weight_kg         numeric(8,1),
  expected_head             int,
  counted_head              int,
  discrepancy_action        text check (discrepancy_action in ('recount_later', 'accepted')),
  related_event_id          uuid references public.stock_events (id),
  withhold_override_reason  text,
  needs_review              boolean not null default false,
  import_batch_id           uuid references public.import_batches (id),
  notes                     text
);
comment on table public.stock_events is 'Every change to stock. Prices are in record_prices (owner only). NVD photos attach through attachment_links.';
comment on column public.stock_events.reason is
  'Exits: sale, saleyard, slaughter, agistment_out, return_from_agistment, other. '
  'Adjustments: dead_found, missing, boxed_with_other_mob, strays_extra, earlier_miscount, unknown.';
create index stock_events_date on public.stock_events (event_date);
call app.setup_table('stock_events');
call app.farm_user_policies('stock_events');

create table public.stock_event_lines (
  id                  uuid primary key default gen_random_uuid(),
  stock_event_id      uuid not null references public.stock_events (id),
  mob_id              uuid not null references public.mobs (id),
  livestock_class_id  uuid references public.livestock_classes (id),
  head_change         int not null,
  withhold_choice     text check (withhold_choice in ('applied', 'not_applied'))
);
comment on column public.stock_event_lines.withhold_choice is 'Splits and merges only, when the source mob is under withhold: did the user apply it to this receiving mob?';
create index stock_event_lines_mob on public.stock_event_lines (mob_id);
create index stock_event_lines_event on public.stock_event_lines (stock_event_id);
call app.setup_table('stock_event_lines');
call app.farm_user_policies('stock_event_lines');

create table public.mob_location_changes (
  id              uuid primary key default gen_random_uuid(),
  stock_event_id  uuid not null references public.stock_events (id),
  mob_id          uuid not null references public.mobs (id),
  property_id     uuid not null references public.properties (id),
  paddock_id      uuid,
  foreign key (paddock_id, property_id) references public.paddocks (id, property_id)
);
comment on column public.mob_location_changes.paddock_id is 'null when the mob is on an outside property (e.g. agistment).';
create index mob_location_changes_mob on public.mob_location_changes (mob_id);
call app.setup_table('mob_location_changes');
call app.farm_user_policies('mob_location_changes');

-- ------------------------------------------------------------
-- Tier 2: individual animals.
-- ------------------------------------------------------------

create table public.animals (
  id                  uuid primary key default gen_random_uuid(),
  species             text not null check (species in ('cattle', 'sheep', 'goat', 'other')),
  visual_tag          text,
  nlis_id             text,
  sex                 text check (sex in ('male', 'female', 'castrate')),
  livestock_class_id  uuid references public.livestock_classes (id),
  birth_date          date,
  birth_year          int,
  breed               text,
  colour_markings     text,
  owner_contact_id    uuid references public.contacts (id),
  registry_ident      text,
  dam_id              uuid references public.animals (id),
  sire_id             uuid references public.animals (id),
  import_batch_id     uuid references public.import_batches (id),
  notes               text,
  archived_at         timestamptz
);
comment on column public.animals.dam_id is 'Tier 3 (stud) hook. Not used yet.';
call app.setup_table('animals');
create unique index animals_nlis_unique on public.animals (nlis_id) where nlis_id is not null and deleted_at is null;
call app.farm_user_policies('animals');

create table public.animal_tags (
  id             uuid primary key default gen_random_uuid(),
  animal_id      uuid not null references public.animals (id),
  tag_type       text not null check (tag_type in ('visual', 'nlis')),
  value          text not null,
  applied_date   date,
  replaced_date  date
);
call app.setup_table('animal_tags');
call app.farm_user_policies('animal_tags');

create table public.animal_event_links (
  id              uuid primary key default gen_random_uuid(),
  stock_event_id  uuid not null references public.stock_events (id),
  animal_id       uuid not null references public.animals (id),
  to_mob_id       uuid references public.mobs (id),
  was_scanned     boolean not null default false
);
create index animal_event_links_animal on public.animal_event_links (animal_id);
call app.setup_table('animal_event_links');
call app.farm_user_policies('animal_event_links');

-- ------------------------------------------------------------
-- Worked-out views. security_invoker = the reader's own access
-- rules apply, so a contractor sees nothing here.
-- ------------------------------------------------------------

-- Live count lines: neither the line nor its event has been deleted.
create view public.live_stock_lines with (security_invoker = true) as
select l.*, e.event_date, e.event_type, e.reason
from public.stock_event_lines l
join public.stock_events e on e.id = l.stock_event_id
where l.deleted_at is null and e.deleted_at is null;

create view public.mob_head_counts with (security_invoker = true) as
select l.mob_id, l.livestock_class_id, sum(l.head_change)::int as head
from public.live_stock_lines l
group by l.mob_id, l.livestock_class_id;

create view public.mob_totals with (security_invoker = true) as
select m.id as mob_id, m.name, m.species,
       coalesce(sum(l.head_change), 0)::int as head
from public.mobs m
left join public.live_stock_lines l on l.mob_id = m.id
where m.deleted_at is null
group by m.id, m.name, m.species;

create view public.mob_current_location with (security_invoker = true) as
select distinct on (c.mob_id)
       c.mob_id, c.property_id, c.paddock_id, e.event_date as since,
       (current_date - e.event_date) as days_there
from public.mob_location_changes c
join public.stock_events e on e.id = c.stock_event_id
where c.deleted_at is null and e.deleted_at is null
order by c.mob_id, e.event_date desc, e.recorded_at desc nulls last, e.created_at desc, c.created_at desc;

-- Mobs or classes taken below zero (offline or late entries). Raised as a recount reminder.
create view public.mobs_below_zero with (security_invoker = true) as
select mob_id, livestock_class_id, head
from public.mob_head_counts
where head < 0;

insert into public.schema_migrations (version, applied_by) values ('0002_livestock', current_user);
