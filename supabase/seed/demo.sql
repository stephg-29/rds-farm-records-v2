-- ============================================================
-- Farm Records v2 · demo farm "Kooringa Pastoral" (made up)
--
-- For a DEMO project only (sales demos, screenshots, training):
-- never run on a client's database. Run once after the migrations,
-- in the SQL editor of the demo project. Dates are relative to today,
-- so the demo always looks current (a mob under withhold, a spray
-- withhold, feed running down, a service due).
--
-- After running: Authentication, Users, Add user (the demo login),
-- then in the SQL editor:
--   insert into public.profiles (user_id, full_name, role)
--   select id, 'Demo owner', 'owner' from auth.users where email = '<demo email>';
-- ============================================================

update public.farm_settings set farm_name = 'Kooringa Pastoral';

-- Properties and paddocks (simple shapes near Walcha NSW).
insert into public.properties (id, name, pic, address, is_own, centre_lat, centre_lng, default_zoom) values
  ('d0000000-0000-4000-8000-000000000001', 'Kooringa', 'NA123456', 'Walcha NSW', true, -30.9800, 151.6000, 15),
  ('d0000000-0000-4000-8000-000000000002', 'Glenvale lease', 'NC345678', 'Walcha NSW', false, -30.9950, 151.6250, 15);

insert into public.paddocks (id, property_id, name, boundary, area_ha, area_overridden)
select p.id::uuid, 'd0000000-0000-4000-8000-000000000001', p.name,
       jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(jsonb_build_array(
         jsonb_build_array(p.x1, p.y1), jsonb_build_array(p.x2, p.y1), jsonb_build_array(p.x2, p.y2), jsonb_build_array(p.x1, p.y2), jsonb_build_array(p.x1, p.y1)))),
       p.ha, false
from (values
  ('d0000000-0000-4000-8000-0000000000a1', 'Creek paddock', 151.5940, -30.9760, 151.6000, -30.9805, 29.0),
  ('d0000000-0000-4000-8000-0000000000a2', 'Middle',        151.6000, -30.9760, 151.6060, -30.9805, 29.0),
  ('d0000000-0000-4000-8000-0000000000a3', 'Back gully',    151.5940, -30.9805, 151.6000, -30.9850, 29.0),
  ('d0000000-0000-4000-8000-0000000000a4', 'River flat',    151.6000, -30.9805, 151.6060, -30.9850, 29.0),
  ('d0000000-0000-4000-8000-0000000000a5', 'House paddock', 151.6060, -30.9760, 151.6090, -30.9790, 9.0)
) as p (id, name, x1, y1, x2, y2, ha);
insert into public.paddocks (id, property_id, name, area_ha, area_overridden) values
  ('d0000000-0000-4000-8000-0000000000a6', 'd0000000-0000-4000-8000-000000000002', 'Lease front', 85, true);

-- Map: an energiser, its fence, a pipe, troughs and a gate.
insert into public.map_features (id, property_id, feature_type, name, geometry) values
  ('d0000000-0000-4000-8000-0000000000f1', 'd0000000-0000-4000-8000-000000000001', 'electric_unit', 'Unit 1 - House block', '{"type":"Point","coordinates":[151.6075,-30.9775]}'),
  ('d0000000-0000-4000-8000-0000000000f2', 'd0000000-0000-4000-8000-000000000001', 'electric_fence', 'Lane fence', '{"type":"LineString","coordinates":[[151.6075,-30.9775],[151.6000,-30.9760],[151.5940,-30.9760]]}'),
  ('d0000000-0000-4000-8000-0000000000f3', 'd0000000-0000-4000-8000-000000000001', 'pipe', 'Poly to the troughs', '{"type":"LineString","coordinates":[[151.6070,-30.9780],[151.6030,-30.9790],[151.5970,-30.9790]]}'),
  ('d0000000-0000-4000-8000-0000000000f4', 'd0000000-0000-4000-8000-000000000001', 'trough', 'Creek trough', '{"type":"Point","coordinates":[151.5970,-30.9790]}'),
  ('d0000000-0000-4000-8000-0000000000f5', 'd0000000-0000-4000-8000-000000000001', 'trough', 'Middle trough', '{"type":"Point","coordinates":[151.6030,-30.9790]}'),
  ('d0000000-0000-4000-8000-0000000000f6', 'd0000000-0000-4000-8000-000000000001', 'gate', 'Lane gate', '{"type":"Point","coordinates":[151.6000,-30.9762]}'),
  ('d0000000-0000-4000-8000-0000000000f7', 'd0000000-0000-4000-8000-000000000001', 'rain_gauge', 'House gauge', '{"type":"Point","coordinates":[151.6080,-30.9770]}');
update public.map_features set electric_unit_id = 'd0000000-0000-4000-8000-0000000000f1' where id = 'd0000000-0000-4000-8000-0000000000f2';

-- Mobs with starting counts (90 days ago) and where they are.
insert into public.mobs (id, name, species) values
  ('d0000000-0000-4000-8000-0000000000b1', 'Yellow tag heifers', 'cattle'),
  ('d0000000-0000-4000-8000-0000000000b2', 'Weaner steers', 'cattle'),
  ('d0000000-0000-4000-8000-0000000000b3', 'River cows', 'cattle'),
  ('d0000000-0000-4000-8000-0000000000b4', 'Angus bulls', 'cattle'),
  ('d0000000-0000-4000-8000-0000000000b5', 'Merino ewes', 'sheep');

with s (mob, cls, head, pdk, prop) as (values
  ('d0000000-0000-4000-8000-0000000000b1', 'Heifers', 50, 'd0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-0000000000b2', 'Weaner steers', 64, 'd0000000-0000-4000-8000-0000000000a3', 'd0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-0000000000b3', 'Cows', 112, 'd0000000-0000-4000-8000-0000000000a4', 'd0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-0000000000b4', 'Bulls', 3, 'd0000000-0000-4000-8000-0000000000a5', 'd0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-0000000000b5', 'Ewes', 420, 'd0000000-0000-4000-8000-0000000000a6', 'd0000000-0000-4000-8000-000000000002')
), ev as (
  insert into public.stock_events (event_date, event_type, reason, to_property_id, counted_head, notes)
  select current_date - 90, 'count_adjustment', 'opening_count', s.prop::uuid, s.head, s.mob from s
  returning id, notes
)
insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change)
select ev.id, s.mob::uuid, (select c.id from public.livestock_classes c where c.name = s.cls order by c.sort_order limit 1), s.head
from ev join s on s.mob = ev.notes;

insert into public.mob_location_changes (stock_event_id, mob_id, property_id, paddock_id)
select e.id, l.mob_id, coalesce(e.to_property_id, 'd0000000-0000-4000-8000-000000000001'),
       (select pdk::uuid from (values
         ('d0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-0000000000a1'), ('d0000000-0000-4000-8000-0000000000b2', 'd0000000-0000-4000-8000-0000000000a3'),
         ('d0000000-0000-4000-8000-0000000000b3', 'd0000000-0000-4000-8000-0000000000a4'), ('d0000000-0000-4000-8000-0000000000b4', 'd0000000-0000-4000-8000-0000000000a5'),
         ('d0000000-0000-4000-8000-0000000000b5', 'd0000000-0000-4000-8000-0000000000a6')) as m (mob, pdk) where m.mob::uuid = l.mob_id)
from public.stock_events e join public.stock_event_lines l on l.stock_event_id = e.id
where e.reason = 'opening_count' and l.mob_id::text like 'd0000000-%';
update public.stock_events set notes = null where reason = 'opening_count' and notes like 'd0000000-%';

-- The heifers moved to Middle 12 days ago, counted 50.
insert into public.stock_events (id, event_date, event_type, from_property_id, to_property_id, expected_head, counted_head)
values ('d0000000-0000-4000-8000-0000000000e1', current_date - 12, 'paddock_move', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 50, 50);
insert into public.mob_location_changes (stock_event_id, mob_id, property_id, paddock_id)
values ('d0000000-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a2');

-- Chemicals: received, written off, used.
insert into public.products (id, name, product_kind, chemical_group, stock_unit, label_whp_days, label_esi_days, label_grazing_whp_days, default_dose_rate, default_route) values
  ('d0000000-0000-4000-8000-0000000000c1', 'Cydectin Pour-On', 'animal_treatment', 'ML', 'L', 42, 42, null, '1 mL/10 kg', 'Pour-on / topical'),
  ('d0000000-0000-4000-8000-0000000000c2', 'Ultravac 7in1', 'animal_treatment', null, 'mL', 0, 0, null, '2 mL', 'Subcutaneous injection'),
  ('d0000000-0000-4000-8000-0000000000c3', '2,4-D Amine 625', 'spray', '4', 'L', null, null, 7, '1.5 L/ha', null),
  ('d0000000-0000-4000-8000-0000000000c4', 'Single super', 'fertiliser', null, 't', null, null, null, '125 kg/ha', null);
insert into public.product_batches (id, product_id, batch_number, expiry_date) values
  ('d0000000-0000-4000-8000-0000000000d1', 'd0000000-0000-4000-8000-0000000000c1', '4471K', current_date + 520),
  ('d0000000-0000-4000-8000-0000000000d2', 'd0000000-0000-4000-8000-0000000000c2', 'B2210', current_date + 20),
  ('d0000000-0000-4000-8000-0000000000d3', 'd0000000-0000-4000-8000-0000000000c3', 'A77', current_date + 300),
  ('d0000000-0000-4000-8000-0000000000d4', 'd0000000-0000-4000-8000-0000000000c4', null, null);
insert into public.chemical_ledger (batch_id, entry_date, entry_type, quantity, write_off_reason, notes) values
  ('d0000000-0000-4000-8000-0000000000d1', current_date - 60, 'received', 5, null, 'From Elders'),
  ('d0000000-0000-4000-8000-0000000000d1', current_date - 30, 'written_off', -0.4, 'leaked_spilled', 'Drum leaked in the shed'),
  ('d0000000-0000-4000-8000-0000000000d2', current_date - 60, 'received', 500, null, null),
  ('d0000000-0000-4000-8000-0000000000d3', current_date - 60, 'received', 20, null, null),
  ('d0000000-0000-4000-8000-0000000000d4', current_date - 200, 'received', 15, null, 'Delivered and spread by contractor');

-- Weaner steers drenched and vaccinated 10 days ago: under withhold for another month.
insert into public.treatments (id, treatment_date, property_id, paddock_id, mob_id, head_treated, livestock_description, treated_by_name, treated_by_phone, equipment_cleaned_calibrated)
values ('d0000000-0000-4000-8000-000000000071', current_date - 10, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a3', 'd0000000-0000-4000-8000-0000000000b2', 64, 'Weaner steers', 'Sam (demo)', '0400 000 000', true);
insert into public.treatment_items (treatment_id, product_id, batch_id, dose_rate, approx_live_weight_kg, route, quantity_used, reason, whp_days, esi_days) values
  ('d0000000-0000-4000-8000-000000000071', 'd0000000-0000-4000-8000-0000000000c1', 'd0000000-0000-4000-8000-0000000000d1', '1 mL/10 kg', 280, 'Pour-on / topical', 1.79, 'Worms', 42, 42),
  ('d0000000-0000-4000-8000-000000000071', 'd0000000-0000-4000-8000-0000000000c2', 'd0000000-0000-4000-8000-0000000000d2', '2 mL', null, 'Subcutaneous injection', 128, 'Vaccination', 0, 0);

-- Thistles sprayed in Back gully 3 days ago: grazing withhold for 4 more days.
insert into public.spray_records (id, spray_date, start_time, finish_time, property_id, situation, target, water_rate, area_ha, wind_speed_direction, temperature_c, humidity_delta_t, equipment, applicator_name, licence_number)
values ('d0000000-0000-4000-8000-000000000081', current_date - 3, '07:30', '09:00', 'd0000000-0000-4000-8000-000000000001', 'Pasture', 'Thistles', '80 L/ha', 29, '8 km/h NE', 18, '60%', 'Boom spray', 'Sam (demo)', 'L12345');
insert into public.spray_record_paddocks (spray_record_id, paddock_id) values ('d0000000-0000-4000-8000-000000000081', 'd0000000-0000-4000-8000-0000000000a3');
insert into public.spray_record_items (spray_record_id, product_id, batch_id, application_rate, quantity_used, grazing_whp_days)
values ('d0000000-0000-4000-8000-000000000081', 'd0000000-0000-4000-8000-0000000000c3', 'd0000000-0000-4000-8000-0000000000d3', '1.5 L/ha', 43.5, 7);

-- Fertiliser last autumn.
insert into public.pasture_records (id, record_date, record_type, property_id, area_ha, overall_rate)
values ('d0000000-0000-4000-8000-000000000091', current_date - 180, 'fertiliser', 'd0000000-0000-4000-8000-000000000001', 58, '125 kg/ha');
insert into public.pasture_record_paddocks (pasture_record_id, paddock_id) values
  ('d0000000-0000-4000-8000-000000000091', 'd0000000-0000-4000-8000-0000000000a1'), ('d0000000-0000-4000-8000-000000000091', 'd0000000-0000-4000-8000-0000000000a2');
insert into public.pasture_record_items (pasture_record_id, item_kind, product_id, batch_id, rate, quantity_used)
values ('d0000000-0000-4000-8000-000000000091', 'fertiliser', 'd0000000-0000-4000-8000-0000000000c4', 'd0000000-0000-4000-8000-0000000000d4', '125 kg/ha', 7.25);

-- Feed: a hay shed, 120 round bales, the cows on hay.
insert into public.feed_storage_sites (id, property_id, name, site_type, capacity, capacity_unit)
values ('d0000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000001', 'Hay shed', 'hay_shed', 300, 'bales');
insert into public.feed_items (id, name, feed_type, unit, kg_per_unit) values
  ('d0000000-0000-4000-8000-000000000102', 'Pasture hay', 'hay', 'round_bale', 400);
insert into public.feed_lots (id, feed_item_id, source, received_date, dry_matter_pct, me_mj_kg, crude_protein_pct)
values ('d0000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000102', 'produced_on_farm', current_date - 120, 88, 8.5, 9);
insert into public.feed_ledger (feed_lot_id, storage_site_id, entry_date, entry_type, quantity)
values ('d0000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000101', current_date - 120, 'produced', 120);
insert into public.rations (id, name) values ('d0000000-0000-4000-8000-000000000104', 'Hay, 6 kg');
insert into public.ration_items (ration_id, feed_item_id, kg_per_head_per_day) values ('d0000000-0000-4000-8000-000000000104', 'd0000000-0000-4000-8000-000000000102', 6);
insert into public.ration_assignments (ration_id, mob_id, start_date) values ('d0000000-0000-4000-8000-000000000104', 'd0000000-0000-4000-8000-0000000000b3', current_date - 14);

-- Breeding: cows joined to the bulls; calving in about a month.
insert into public.joinings (mob_id, sire_mob_id, paddock_id, start_date, end_date)
values ('d0000000-0000-4000-8000-0000000000b3', 'd0000000-0000-4000-8000-0000000000b4', 'd0000000-0000-4000-8000-0000000000a4', current_date - 255, current_date - 195);

-- Vehicle with a service due next week; rainfall; documents; an open issue.
insert into public.vehicles (id, name, vehicle_type, rego, reading_unit) values ('d0000000-0000-4000-8000-000000000111', 'Hilux', 'Ute', 'DEMO01', 'km');
insert into public.vehicle_services (vehicle_id, service_date, reading, service_type, work_done, done_by, next_due_date, next_due_reading)
values ('d0000000-0000-4000-8000-000000000111', current_date - 170, 142000, 'Routine service', '{"Engine oil","Oil filter","Tyres"}', 'Walcha Diesel', current_date + 7, 152000);
insert into public.readings (measure, value, observed_at, property_id, map_feature_id)
select 'rainfall_mm', v, (current_date - d)::timestamp + time '09:00', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000f7'
from (values (12.5, 2), (4.0, 9), (22.0, 21), (8.5, 40), (31.0, 63)) as r (v, d);
insert into public.documents (title, document_kind, document_date, review_due) values
  ('Farm biosecurity plan', 'biosecurity_plan', current_date - 340, current_date + 25),
  ('Property risk assessment', 'property_risk_assessment', current_date - 340, current_date + 25);
insert into public.issues (reported_at, categories, notes, lat, lng, property_id, paddock_id, map_feature_id, status)
values (now() - interval '1 day', '{"Trough","Float valve"}', 'Float valve stuck, trough overflowing', -30.979, 151.597, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-0000000000f4', 'new');
