-- ============================================================
-- Farm Records v2 · 0008 Default lists and reports
--
-- Defaults every new client starts with (all editable), and the
-- worked-out reports: reminders, livestock reconciliation, paddock
-- and mob history, LPA registers for the audit pack.
-- ============================================================

-- ------------------------------------------------------------
-- Default pick lists and livestock classes.
-- ------------------------------------------------------------

insert into public.pick_lists (list_name, value, sort_order)
select l.list_name, v.value, v.ord
from (values
  ('vehicle_work_done', array['Engine oil', 'Oil filter', 'Fuel filter', 'Air filter', 'Cabin filter', 'Hydraulic oil',
                              'Hydraulic filter', 'Coolant', 'Transmission/diff oil', 'Grease', 'Tyres', 'Brakes',
                              'Belts', 'Battery', 'Wipers', 'Other']),
  ('issue_category',    array['Trough', 'Float valve', 'Pipe leak', 'Fence down', 'Electric fence', 'Gate', 'Weeds', 'Other']),
  ('treatment_route',   array['Pour-on / topical', 'Subcutaneous injection', 'Intramuscular injection', 'Oral / drench',
                              'In feed / water', 'Intraruminal', 'Other']),
  ('treatment_reason',  array['Worms', 'Lice', 'Flies', 'Ticks', 'Vaccination', 'Illness', 'Injury', 'Other']),
  ('vehicle_service_type', array['Routine service', 'Repair', 'Tyres', 'Inspection', 'Other'])
) as l (list_name, vals)
cross join lateral unnest(l.vals) with ordinality as v (value, ord)
on conflict (list_name, value) do nothing;

insert into public.livestock_classes (species, name, sex, sort_order) values
  ('cattle', 'Cows', 'female', 10), ('cattle', 'Heifers', 'female', 20), ('cattle', 'Steers', 'castrate', 30),
  ('cattle', 'Bulls', 'male', 40), ('cattle', 'Weaner steers', 'castrate', 50), ('cattle', 'Weaner heifers', 'female', 60),
  ('cattle', 'Calves', 'mixed', 70),
  ('sheep', 'Ewes', 'female', 10), ('sheep', 'Wethers', 'castrate', 20), ('sheep', 'Rams', 'male', 30),
  ('sheep', 'Lambs', 'mixed', 40), ('sheep', 'Hoggets', 'mixed', 50),
  ('goat', 'Does', 'female', 10), ('goat', 'Bucks', 'male', 20), ('goat', 'Kids', 'mixed', 30)
on conflict (species, name) do nothing;

-- ------------------------------------------------------------
-- Reminders: one list everyone sees on Home.
-- ------------------------------------------------------------

create view public.reminders with (security_invoker = true) as
select 'withhold_ending'::text as kind, w.mob_id as record_id, 'mobs'::text as record_table,
       coalesce(w.whp_until, w.esi_until) + 1 as due_date,
       format('%s clear of withhold', m.name) as message
from public.active_withholds w join public.mobs m on m.id = w.mob_id
where coalesce(w.whp_until, w.esi_until) <= current_date + 14
union all
select 'batch_expiring', c.batch_id, 'product_batches', c.expiry_date,
       format('%s batch %s expires', c.product_name, coalesce(c.batch_number, '(no number)'))
from public.chemical_on_hand c
where c.expiry_date <= current_date + 30 and c.on_hand > 0
union all
select 'stocktake_needed', c.batch_id, 'product_batches', current_date,
       format('%s is below zero: do a stocktake', c.product_name)
from public.chemical_on_hand c where c.needs_stocktake
union all
select 'nlis_to_do', e.id, 'stock_events', e.event_date, 'NLIS transfer to do'
from public.stock_events e where e.deleted_at is null and e.nlis_transfer_status = 'to_do'
union all
select 'recount', e.id, 'stock_events', e.event_date,
       format('Recount: book %s, counted %s', e.expected_head, e.counted_head)
from public.stock_events e where e.deleted_at is null and e.discrepancy_action = 'recount_later'
union all
select 'recount', z.mob_id, 'mobs', current_date, format('%s is below zero: recount', m.name)
from public.mobs_below_zero z join public.mobs m on m.id = z.mob_id
union all
select 'exit_needs_review', e.id, 'stock_events', e.event_date, 'Sale or slaughter recorded inside a withhold: check now'
from public.stock_events e where e.deleted_at is null and e.needs_review
union all
select 'vehicle_service_due', h.vehicle_id, 'vehicles', h.next_due_date, format('%s service due', h.name)
from public.vehicle_history h where h.next_due_date <= current_date + 14
union all
select 'document_review', d.id, 'documents', d.review_due, format('Review: %s', d.title)
from public.documents d where d.deleted_at is null and d.review_due <= current_date + 30
union all
select 'births_due', j.id, 'joinings', j.expected_birth_start, format('%s: calving/lambing from', m.name)
from public.joinings j join public.mobs m on m.id = j.mob_id
where j.deleted_at is null and j.expected_birth_start between current_date and current_date + 30;

-- ------------------------------------------------------------
-- Livestock reconciliation for any date range (e.g. the financial
-- year): opening + births + purchases - sales - deaths ± other = closing.
-- Call as: select * from livestock_reconciliation('2025-07-01', '2026-06-30');
-- ------------------------------------------------------------

create or replace function public.livestock_reconciliation(p_from date, p_to date)
returns table (species text, class_name text, opening int, births int, purchases int, sales int,
               deaths int, other_changes int, closing int)
language sql stable security invoker
set search_path = public
as $$
  with lines as (
    select m.species, c.name as class_name, l.event_date, l.event_type, l.reason, l.head_change
    from public.live_stock_lines l
    join public.mobs m on m.id = l.mob_id
    left join public.livestock_classes c on c.id = l.livestock_class_id
    -- moves between the farm's own mobs net to zero, so only real changes count
  )
  select species, coalesce(class_name, '(no class)'),
    coalesce(sum(head_change) filter (where event_date < p_from), 0)::int,
    coalesce(sum(head_change) filter (where event_date between p_from and p_to and event_type = 'birth_marking'), 0)::int,
    coalesce(sum(head_change) filter (where event_date between p_from and p_to and event_type = 'arrival'), 0)::int,
    coalesce(-sum(head_change) filter (where event_date between p_from and p_to and event_type = 'exit'), 0)::int,
    coalesce(-sum(head_change) filter (where event_date between p_from and p_to and event_type = 'death'), 0)::int,
    coalesce(sum(head_change) filter (where event_date between p_from and p_to
                                      and event_type not in ('birth_marking', 'arrival', 'exit', 'death')), 0)::int,
    coalesce(sum(head_change) filter (where event_date <= p_to), 0)::int
  from lines
  group by species, class_name
  order by species, class_name
$$;

-- ------------------------------------------------------------
-- History boxes.
-- ------------------------------------------------------------

create view public.mob_treatment_history with (security_invoker = true) as
select w.mob_id, t.treatment_date, p.name as product_name, p.chemical_group, i.whp_until, i.esi_until,
       (w.effective_from > t.treatment_date) as inherited_from_other_mob,
       (current_date - t.treatment_date) as days_ago
from public.mob_withholds w
join public.treatment_items i on w.source_table = 'treatment_items' and i.id = w.source_id
join public.treatments t on t.id = i.treatment_id
join public.products p on p.id = i.product_id;

create view public.paddock_grazing_history with (security_invoker = true) as
with stays as (
  select c.paddock_id, c.mob_id, e.event_date as in_date,
         lead(e.event_date) over (partition by c.mob_id order by e.event_date, e.created_at) as out_date
  from public.mob_location_changes c
  join public.stock_events e on e.id = c.stock_event_id
  where c.deleted_at is null and e.deleted_at is null
)
select s.paddock_id, s.mob_id, m.name as mob_name, s.in_date, s.out_date
from stays s join public.mobs m on m.id = s.mob_id
where s.paddock_id is not null;

create view public.paddock_rest_days with (security_invoker = true) as
select p.id as paddock_id, p.name,
       case when bool_or(h.out_date is null) then 0
            else current_date - max(h.out_date) end as days_rested
from public.paddocks p
left join public.paddock_grazing_history h on h.paddock_id = p.id
where p.deleted_at is null
group by p.id, p.name;

-- ------------------------------------------------------------
-- LPA registers (for the audit pack export). Wording follows the
-- ISC livestock treatment record template; this is a record of what
-- the farmer entered, not a compliance guarantee.
-- ------------------------------------------------------------

create view public.lpa_treatment_register with (security_invoker = true) as
select t.treatment_date, coalesce(t.livestock_description, m.name) as livestock_description,
       pd.name as location, m.name as mob_or_tag, t.head_treated, p.name as product_trade_name,
       coalesce(b.batch_number, '(not recorded)') as batch_number, b.expiry_date as product_expiry_date,
       concat_ws(' · ', i.dose_rate, case when i.approx_live_weight_kg is not null then i.approx_live_weight_kg || ' kg' end) as dose_and_weight,
       coalesce(pr.full_name, t.treated_by_name) as treated_by, coalesce(pr.phone, t.treated_by_phone) as treated_by_phone,
       i.whp_days, i.esi_days, i.whp_until + 1 as safe_for_slaughter, i.adverse_reactions, i.broken_needle,
       t.equipment_cleaned_calibrated, t.equipment_cleaned_by,
       (i.updated_at is not null or t.updated_at is not null) as edited
from public.treatment_items i
join public.treatments t on t.id = i.treatment_id
join public.products p on p.id = i.product_id
left join public.product_batches b on b.id = i.batch_id
left join public.mobs m on m.id = t.mob_id
left join public.paddocks pd on pd.id = t.paddock_id
left join public.profiles pr on pr.user_id = t.treated_by_user_id
where i.deleted_at is null and t.deleted_at is null;

create view public.lpa_movement_register with (security_invoker = true) as
select e.event_date, e.event_type, e.reason, fp.name as from_property, fp.pic as from_pic,
       tp.name as to_property, tp.pic as to_pic, e.nvd_number, e.nlis_transfer_status,
       abs(sum(l.head_change))::int as head
from public.stock_events e
left join public.properties fp on fp.id = e.from_property_id
left join public.properties tp on tp.id = e.to_property_id
left join public.stock_event_lines l on l.stock_event_id = e.id and l.deleted_at is null
where e.deleted_at is null and e.event_type in ('arrival', 'exit')
   or (e.deleted_at is null and e.from_property_id is distinct from e.to_property_id
       and e.from_property_id is not null and e.to_property_id is not null)
group by e.id, fp.name, fp.pic, tp.name, tp.pic;

insert into public.schema_migrations (version, applied_by) values ('0008_defaults_and_reports', current_user);
