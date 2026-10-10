-- ============================================================
-- Farm Records v2 · demo farm "Yarrabee Downs" (made up)
--
-- About 500 ha of New England grazing country east of Armidale NSW,
-- running Merino sheep and Angus cattle. Every name, person, PIC and
-- number here is invented.
--
-- Used two ways:
--  * The app's built-in demo (no login, nothing leaves the phone):
--    scripts/build-demo-data.mjs loads this into a scratch database
--    and saves the records for the app. See docs/DEMO.md.
--  * A DEMO Supabase project only (never a client's database): run
--    once after the migrations in the SQL editor. Then add the demo
--    login (Authentication, Users, Add user) and in the SQL editor:
--      insert into public.profiles (user_id, full_name, role)
--      select id, 'Demo owner', 'owner' from auth.users where email = '<demo email>';
--
-- Dates are relative to today, so the demo always looks current: a
-- mob under withhold, a part-treated mob, a paddock under spray
-- withhold, a part-done contractor spray, a gate left open, feed
-- running down, a service due.
-- ============================================================

update public.farm_settings set farm_name = 'Yarrabee Downs';

insert into public.properties (id, name, pic, address, is_own, centre_lat, centre_lng, default_zoom) values
  ('d0000000-0000-4000-8000-000000000001', 'Yarrabee Downs', 'NE000001', 'Armidale NSW', true, -30.5642, 151.6003, 14);

-- Twelve paddocks, every fence shared with its neighbour (about 501 ha).
insert into public.paddocks (id, property_id, name, boundary, area_ha, area_overridden)
select p.id::uuid, 'd0000000-0000-4000-8000-000000000001', p.name, p.boundary::jsonb, p.ha, false
from (values
  ('d0000000-0000-4000-8000-0000000000a1', 'Top hill', '{"type":"Polygon","coordinates":[[[151.5894,-30.5535],[151.594075,-30.5535],[151.595242,-30.560621],[151.5894,-30.561072],[151.5894,-30.5535]]]}', 41.3),
  ('d0000000-0000-4000-8000-0000000000a2', 'Ridge', '{"type":"Polygon","coordinates":[[[151.594075,-30.5535],[151.601023,-30.5535],[151.6012,-30.5594],[151.595242,-30.560621],[151.594075,-30.5535]]]}', 45.2),
  ('d0000000-0000-4000-8000-0000000000a3', 'Woolshed', '{"type":"Polygon","coordinates":[[[151.601023,-30.5535],[151.605488,-30.5535],[151.608,-30.559],[151.6012,-30.5594],[151.601023,-30.5535]]]}', 34.5),
  ('d0000000-0000-4000-8000-0000000000a4', 'Road paddock', '{"type":"Polygon","coordinates":[[[151.605488,-30.5535],[151.6113,-30.5535],[151.6113,-30.560408],[151.608,-30.559],[151.605488,-30.5535]]]}', 29.2),
  ('d0000000-0000-4000-8000-0000000000a5', 'Stringybark', '{"type":"Polygon","coordinates":[[[151.5894,-30.561072],[151.595242,-30.560621],[151.595382,-30.568195],[151.5894,-30.567643],[151.5894,-30.561072]]]}', 44.5),
  ('d0000000-0000-4000-8000-0000000000a6', 'Dam paddock', '{"type":"Polygon","coordinates":[[[151.595242,-30.560621],[151.6012,-30.5594],[151.600149,-30.567542],[151.595382,-30.568195],[151.595242,-30.560621]]]}', 44.4),
  ('d0000000-0000-4000-8000-0000000000a7', 'House paddock', '{"type":"Polygon","coordinates":[[[151.6012,-30.5594],[151.608,-30.559],[151.606142,-30.568458],[151.600149,-30.567542],[151.6012,-30.5594]]]}', 60.3),
  ('d0000000-0000-4000-8000-0000000000a8', 'Bull paddock', '{"type":"Polygon","coordinates":[[[151.608,-30.559],[151.6113,-30.560408],[151.6113,-30.567576],[151.606142,-30.568458],[151.608,-30.559]]]}', 37.7),
  ('d0000000-0000-4000-8000-0000000000a9', 'Back gully', '{"type":"Polygon","coordinates":[[[151.5894,-30.567643],[151.595382,-30.568195],[151.594824,-30.575],[151.5894,-30.575],[151.5894,-30.567643]]]}', 43.1),
  ('d0000000-0000-4000-8000-0000000000aa', 'Creek flat', '{"type":"Polygon","coordinates":[[[151.595382,-30.568195],[151.600149,-30.567542],[151.601026,-30.575],[151.594824,-30.575],[151.595382,-30.568195]]]}', 41.7),
  ('d0000000-0000-4000-8000-0000000000ab', 'Long paddock', '{"type":"Polygon","coordinates":[[[151.600149,-30.567542],[151.606142,-30.568458],[151.606317,-30.575],[151.601026,-30.575],[151.600149,-30.567542]]]}', 41.8),
  ('d0000000-0000-4000-8000-0000000000ac', 'Bottom flat', '{"type":"Polygon","coordinates":[[[151.606142,-30.568458],[151.6113,-30.567576],[151.6113,-30.575],[151.606317,-30.575],[151.606142,-30.568458]]]}', 37.7)
) as p (id, name, boundary, ha);

-- Map: house, shed and yards, water, power and a gate.
insert into public.map_features (id, property_id, feature_type, name, geometry) values
  ('d0000000-0000-4000-8000-0000000000f1', 'd0000000-0000-4000-8000-000000000001', 'electric_unit', 'Energiser - house', '{"type":"Point","coordinates":[151.6040,-30.5612]}'),
  ('d0000000-0000-4000-8000-0000000000f2', 'd0000000-0000-4000-8000-000000000001', 'electric_fence', 'Dam / House hot wire', '{"type":"LineString","coordinates":[[151.6040,-30.5612],[151.6012,-30.5594],[151.600149,-30.567542]]}'),
  ('d0000000-0000-4000-8000-0000000000f3', 'd0000000-0000-4000-8000-000000000001', 'tank', 'House tank 22,000 L', '{"type":"Point","coordinates":[151.6048,-30.5603]}'),
  ('d0000000-0000-4000-8000-0000000000f4', 'd0000000-0000-4000-8000-000000000001', 'pipe', 'Poly to the troughs', '{"type":"LineString","coordinates":[[151.6048,-30.5603],[151.6012,-30.5594],[151.5982,-30.5572],[151.5958,-30.5640]]}'),
  ('d0000000-0000-4000-8000-0000000000f5', 'd0000000-0000-4000-8000-000000000001', 'trough', 'Ridge trough', '{"type":"Point","coordinates":[151.5982,-30.5572]}'),
  ('d0000000-0000-4000-8000-0000000000f6', 'd0000000-0000-4000-8000-000000000001', 'trough', 'Dam paddock trough', '{"type":"Point","coordinates":[151.5958,-30.5640]}'),
  ('d0000000-0000-4000-8000-0000000000f7', 'd0000000-0000-4000-8000-000000000001', 'dam', 'Big dam', '{"type":"Point","coordinates":[151.5985,-30.5645]}'),
  ('d0000000-0000-4000-8000-0000000000f8', 'd0000000-0000-4000-8000-000000000001', 'yard', 'Sheep yards', '{"type":"Point","coordinates":[151.6036,-30.5562]}'),
  ('d0000000-0000-4000-8000-0000000000f9', 'd0000000-0000-4000-8000-000000000001', 'gate', 'Woolshed / Road gate', '{"type":"Point","coordinates":[151.6068,-30.5565]}'),
  ('d0000000-0000-4000-8000-0000000000fa', 'd0000000-0000-4000-8000-000000000001', 'rain_gauge', 'House gauge', '{"type":"Point","coordinates":[151.6044,-30.5608]}'),
  ('d0000000-0000-4000-8000-0000000000fb', 'd0000000-0000-4000-8000-000000000001', 'trough', 'Long paddock trough', '{"type":"Point","coordinates":[151.6030,-30.5712]}');
update public.map_features set electric_unit_id = 'd0000000-0000-4000-8000-0000000000f1' where id = 'd0000000-0000-4000-8000-0000000000f2';

insert into public.contacts (id, name, business_name, kinds, phone) values
  ('d0000000-0000-4000-8000-000000000121', 'Chris Ridge', 'Ridge Spraying (demo)', '{contractor}', '0400 000 001'),
  ('d0000000-0000-4000-8000-000000000122', 'Pat Nolan', 'Tableland Livestock Agents (demo)', '{agent}', '0400 000 002'),
  ('d0000000-0000-4000-8000-000000000123', 'Front counter', 'Armidale Rural Supplies (demo)', '{vendor}', '02 0000 0003');

-- Mobs: Merino sheep and Angus cattle. Starting counts 120 days ago.
insert into public.mobs (id, name, species) values
  ('d0000000-0000-4000-8000-0000000000b1', 'Angus cows', 'cattle'),
  ('d0000000-0000-4000-8000-0000000000b2', 'Angus bulls', 'cattle'),
  ('d0000000-0000-4000-8000-0000000000b3', 'Weaner steers', 'cattle'),
  ('d0000000-0000-4000-8000-0000000000b4', 'Replacement heifers', 'cattle'),
  ('d0000000-0000-4000-8000-0000000000b5', 'Merino ewes', 'sheep'),
  ('d0000000-0000-4000-8000-0000000000b6', 'Merino wethers', 'sheep'),
  ('d0000000-0000-4000-8000-0000000000b7', 'Ewe lambs', 'sheep'),
  ('d0000000-0000-4000-8000-0000000000b8', 'Merino rams', 'sheep');

-- A starting count, and a move (with a count) into a paddock.
create or replace function pg_temp.opening(p_mob uuid, p_class text, p_species text, p_head int, p_paddock uuid, p_days int)
returns void language plpgsql as $$
declare v_ev uuid := gen_random_uuid();
begin
  insert into public.stock_events (id, event_date, event_type, reason, to_property_id, counted_head)
  values (v_ev, current_date - p_days, 'count_adjustment', 'opening_count', 'd0000000-0000-4000-8000-000000000001', p_head);
  insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change)
  values (v_ev, p_mob, (select c.id from public.livestock_classes c where c.name = p_class and c.species = p_species order by c.sort_order limit 1), p_head);
  insert into public.mob_location_changes (stock_event_id, mob_id, property_id, paddock_id)
  values (v_ev, p_mob, 'd0000000-0000-4000-8000-000000000001', p_paddock);
end $$;
create or replace function pg_temp.move(p_mob uuid, p_head int, p_paddock uuid, p_days int)
returns void language plpgsql as $$
declare v_ev uuid := gen_random_uuid();
begin
  insert into public.stock_events (id, event_date, event_type, from_property_id, to_property_id, expected_head, counted_head)
  values (v_ev, current_date - p_days, 'paddock_move', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', p_head, p_head);
  insert into public.mob_location_changes (stock_event_id, mob_id, property_id, paddock_id)
  values (v_ev, p_mob, 'd0000000-0000-4000-8000-000000000001', p_paddock);
end $$;

select pg_temp.opening('d0000000-0000-4000-8000-0000000000b1', 'Cows', 'cattle', 160, 'd0000000-0000-4000-8000-0000000000aa', 120);
select pg_temp.opening('d0000000-0000-4000-8000-0000000000b2', 'Bulls', 'cattle', 5, 'd0000000-0000-4000-8000-0000000000a8', 120);
select pg_temp.opening('d0000000-0000-4000-8000-0000000000b3', 'Weaner steers', 'cattle', 85, 'd0000000-0000-4000-8000-0000000000a9', 120);
select pg_temp.opening('d0000000-0000-4000-8000-0000000000b4', 'Heifers', 'cattle', 60, 'd0000000-0000-4000-8000-0000000000a7', 120);
select pg_temp.opening('d0000000-0000-4000-8000-0000000000b5', 'Ewes', 'sheep', 1200, 'd0000000-0000-4000-8000-0000000000a1', 120);
select pg_temp.opening('d0000000-0000-4000-8000-0000000000b6', 'Wethers', 'sheep', 600, 'd0000000-0000-4000-8000-0000000000a3', 120);
select pg_temp.opening('d0000000-0000-4000-8000-0000000000b7', 'Lambs', 'sheep', 450, 'd0000000-0000-4000-8000-0000000000a4', 120);
select pg_temp.opening('d0000000-0000-4000-8000-0000000000b8', 'Rams', 'sheep', 18, 'd0000000-0000-4000-8000-0000000000a8', 120);

-- Ewe lambs to Dam paddock; cows to Long paddock; ewes and rams in together
-- on the Ridge for joining; the steers to Stringybark two days ago.
select pg_temp.move('d0000000-0000-4000-8000-0000000000b7', 450, 'd0000000-0000-4000-8000-0000000000a6', 45);
select pg_temp.move('d0000000-0000-4000-8000-0000000000b1', 160, 'd0000000-0000-4000-8000-0000000000ab', 34);
select pg_temp.move('d0000000-0000-4000-8000-0000000000b5', 1198, 'd0000000-0000-4000-8000-0000000000a2', 21);
select pg_temp.move('d0000000-0000-4000-8000-0000000000b8', 18, 'd0000000-0000-4000-8000-0000000000a2', 21);
select pg_temp.move('d0000000-0000-4000-8000-0000000000b3', 85, 'd0000000-0000-4000-8000-0000000000a5', 2);

-- Two ewe deaths last month.
with ev as (
  insert into public.stock_events (event_date, event_type, reason, notes)
  values (current_date - 26, 'death', 'Flystrike', 'Found near the Ridge trough') returning id
)
insert into public.stock_event_lines (stock_event_id, mob_id, livestock_class_id, head_change)
select ev.id, 'd0000000-0000-4000-8000-0000000000b5', (select c.id from public.livestock_classes c where c.name = 'Ewes' order by c.sort_order limit 1), -2 from ev;

-- The wethers have the gate open between Woolshed and Road paddock.
insert into public.paddock_joins (property_id, paddock_ids, opened_on, notes)
values ('d0000000-0000-4000-8000-000000000001', '{d0000000-0000-4000-8000-0000000000a3,d0000000-0000-4000-8000-0000000000a4}', current_date - 6, 'Gate left open for the wethers');

-- Chemicals and fertiliser: received, written off, used.
insert into public.products (id, name, product_kind, chemical_group, stock_unit, label_whp_days, label_esi_days, label_grazing_whp_days, default_dose_rate, default_route) values
  ('d0000000-0000-4000-8000-0000000000c1', 'Cydectin Pour-On', 'animal_treatment', 'ML', 'L', 42, 42, null, '1 mL/10 kg', 'Pour-on / topical'),
  ('d0000000-0000-4000-8000-0000000000c2', 'Ultravac 7in1', 'animal_treatment', null, 'mL', 0, 0, null, '2 mL', 'Subcutaneous injection'),
  ('d0000000-0000-4000-8000-0000000000c5', 'Extinosad Pour-On', 'animal_treatment', 'Spinosyn', 'L', 0, 0, null, '1 mL/10 kg', 'Pour-on / topical'),
  ('d0000000-0000-4000-8000-0000000000c6', 'Zolvix Plus', 'animal_treatment', 'AD + ML', 'L', 14, 21, null, '1 mL/10 kg', 'Oral drench'),
  ('d0000000-0000-4000-8000-0000000000c3', '2,4-D Amine 625', 'spray', '4', 'L', null, null, 7, '1.5 L/ha', null),
  ('d0000000-0000-4000-8000-0000000000c7', 'Grazon Extra', 'spray', '4', 'L', null, null, 7, '500 mL/100 L', null),
  ('d0000000-0000-4000-8000-0000000000c4', 'Single super', 'fertiliser', null, 't', null, null, null, '125 kg/ha', null);
insert into public.product_batches (id, product_id, batch_number, expiry_date) values
  ('d0000000-0000-4000-8000-0000000000d1', 'd0000000-0000-4000-8000-0000000000c1', '4471K', current_date + 520),
  ('d0000000-0000-4000-8000-0000000000d2', 'd0000000-0000-4000-8000-0000000000c2', 'B2210', current_date + 20),
  ('d0000000-0000-4000-8000-0000000000d5', 'd0000000-0000-4000-8000-0000000000c5', 'EX903', current_date + 400),
  ('d0000000-0000-4000-8000-0000000000d6', 'd0000000-0000-4000-8000-0000000000c6', 'ZP118', current_date + 610),
  ('d0000000-0000-4000-8000-0000000000d3', 'd0000000-0000-4000-8000-0000000000c3', 'A77', current_date + 300),
  ('d0000000-0000-4000-8000-0000000000d7', 'd0000000-0000-4000-8000-0000000000c7', 'GX52', current_date + 450),
  ('d0000000-0000-4000-8000-0000000000d4', 'd0000000-0000-4000-8000-0000000000c4', null, null);
insert into public.chemical_ledger (batch_id, entry_date, entry_type, quantity, write_off_reason, notes) values
  ('d0000000-0000-4000-8000-0000000000d1', current_date - 60, 'received', 5, null, 'From Armidale Rural Supplies'),
  ('d0000000-0000-4000-8000-0000000000d1', current_date - 30, 'written_off', -0.4, 'leaked_spilled', 'Drum leaked in the shed'),
  ('d0000000-0000-4000-8000-0000000000d2', current_date - 60, 'received', 500, null, null),
  ('d0000000-0000-4000-8000-0000000000d5', current_date - 40, 'received', 15, null, null),
  ('d0000000-0000-4000-8000-0000000000d6', current_date - 40, 'received', 5, null, null),
  ('d0000000-0000-4000-8000-0000000000d3', current_date - 60, 'received', 100, null, '5 x 20 L drums'),
  ('d0000000-0000-4000-8000-0000000000d7', current_date - 20, 'received', 10, null, null),
  ('d0000000-0000-4000-8000-0000000000d4', current_date - 200, 'received', 18, null, 'Delivered and spread by contractor');

-- Weaner steers drenched and vaccinated 10 days ago: under withhold for another month.
insert into public.treatments (id, treatment_date, property_id, paddock_id, mob_id, head_treated, mob_head, livestock_description, treated_by_name, treated_by_phone, equipment_cleaned_calibrated)
values ('d0000000-0000-4000-8000-000000000071', current_date - 10, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a9', 'd0000000-0000-4000-8000-0000000000b3', 85, 85, 'Weaner steers', 'Sam (demo)', '0400 000 000', true);
insert into public.treatment_items (treatment_id, product_id, batch_id, dose_rate, approx_live_weight_kg, route, quantity_used, reason, whp_days, esi_days) values
  ('d0000000-0000-4000-8000-000000000071', 'd0000000-0000-4000-8000-0000000000c1', 'd0000000-0000-4000-8000-0000000000d1', '1 mL/10 kg', 280, 'Pour-on / topical', 2.38, 'Worms', 42, 42),
  ('d0000000-0000-4000-8000-000000000071', 'd0000000-0000-4000-8000-0000000000c2', 'd0000000-0000-4000-8000-0000000000d2', '2 mL', null, 'Subcutaneous injection', 170, 'Vaccination', 0, 0);

-- Ewe lambs drenched 12 days ago: meat withhold ends in 2 days, export (ESI) in 9.
insert into public.treatments (id, treatment_date, property_id, paddock_id, mob_id, head_treated, mob_head, livestock_description, treated_by_name, equipment_cleaned_calibrated)
values ('d0000000-0000-4000-8000-000000000072', current_date - 12, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a6', 'd0000000-0000-4000-8000-0000000000b7', 450, 450, 'Ewe lambs', 'Sam (demo)', true);
insert into public.treatment_items (treatment_id, product_id, batch_id, dose_rate, approx_live_weight_kg, route, quantity_used, reason, whp_days, esi_days) values
  ('d0000000-0000-4000-8000-000000000072', 'd0000000-0000-4000-8000-0000000000c6', 'd0000000-0000-4000-8000-0000000000d6', '1 mL/10 kg', 32, 'Oral drench', 1.44, 'Worms (WEC 840 epg)', 14, 21);

-- Ewes treated for lice 3 days ago, but only 1,150 of the 1,198 came in: part treated.
insert into public.treatments (id, treatment_date, property_id, paddock_id, mob_id, head_treated, mob_head, livestock_description, treated_by_name, equipment_cleaned_calibrated, notes)
values ('d0000000-0000-4000-8000-000000000073', current_date - 3, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a2', 'd0000000-0000-4000-8000-0000000000b5', 1150, 1198, 'Merino ewes', 'Sam (demo)', true, 'Muster missed a few in the back corner');
insert into public.treatment_items (treatment_id, product_id, batch_id, dose_rate, approx_live_weight_kg, route, quantity_used, reason, whp_days, esi_days) values
  ('d0000000-0000-4000-8000-000000000073', 'd0000000-0000-4000-8000-0000000000c5', 'd0000000-0000-4000-8000-0000000000d5', '1 mL/10 kg', 55, 'Pour-on / topical', 6.33, 'Lice', 0, 0);

-- Thistles sprayed on Creek flat 3 days ago: grazing withhold for 4 more days.
insert into public.spray_records (id, spray_date, start_time, finish_time, property_id, situation, target, water_rate, area_ha, wind_speed_direction, temperature_c, humidity_delta_t, equipment, applicator_name, licence_number)
values ('d0000000-0000-4000-8000-000000000081', current_date - 3, '07:30', '09:15', 'd0000000-0000-4000-8000-000000000001', 'Pasture', 'Variegated thistle', '80 L/ha', 41.7, '8 km/h NE', 18, 'Delta T 4', 'Boom spray', 'Sam (demo)', 'NSW-ACU-00000');
insert into public.spray_record_paddocks (spray_record_id, paddock_id) values ('d0000000-0000-4000-8000-000000000081', 'd0000000-0000-4000-8000-0000000000aa');
insert into public.spray_record_items (spray_record_id, product_id, batch_id, application_rate, quantity_used, grazing_whp_days)
values ('d0000000-0000-4000-8000-000000000081', 'd0000000-0000-4000-8000-0000000000c3', 'd0000000-0000-4000-8000-0000000000d3', '1.5 L/ha', 62.5, 7);

-- Fertiliser last autumn; House paddock only part done (the spreader ran out).
insert into public.pasture_records (id, record_date, record_type, property_id, area_ha, overall_rate, contractor_contact_id, notes)
values ('d0000000-0000-4000-8000-000000000091', current_date - 180, 'fertiliser', 'd0000000-0000-4000-8000-000000000001', 113.5, '125 kg/ha', 'd0000000-0000-4000-8000-000000000123', 'Spread by the supplier''s truck');
insert into public.pasture_record_paddocks (pasture_record_id, paddock_id, coverage, area_done_ha, part_reason) values
  ('d0000000-0000-4000-8000-000000000091', 'd0000000-0000-4000-8000-0000000000aa', 'full', null, null),
  ('d0000000-0000-4000-8000-000000000091', 'd0000000-0000-4000-8000-0000000000ab', 'full', null, null),
  ('d0000000-0000-4000-8000-000000000091', 'd0000000-0000-4000-8000-0000000000a7', 'part', 30, 'Ran out of product');
insert into public.pasture_record_items (pasture_record_id, item_kind, product_id, batch_id, rate, quantity_used)
values ('d0000000-0000-4000-8000-000000000091', 'fertiliser', 'd0000000-0000-4000-8000-0000000000c4', 'd0000000-0000-4000-8000-0000000000d4', '125 kg/ha', 14.2);

-- Bottom flat resown 75 days ago and not grazed since.
insert into public.pasture_records (id, record_date, record_type, property_id, area_ha, overall_rate, notes)
values ('d0000000-0000-4000-8000-000000000092', current_date - 75, 'pasture_improvement', 'd0000000-0000-4000-8000-000000000001', 37.7, null, 'Direct drilled after a summer fallow');
insert into public.pasture_record_paddocks (pasture_record_id, paddock_id) values ('d0000000-0000-4000-8000-000000000092', 'd0000000-0000-4000-8000-0000000000ac');
insert into public.pasture_record_items (pasture_record_id, item_kind, species_name, rate) values
  ('d0000000-0000-4000-8000-000000000092', 'species', 'Phalaris', '3 kg/ha'),
  ('d0000000-0000-4000-8000-000000000092', 'species', 'Sub clover', '8 kg/ha'),
  ('d0000000-0000-4000-8000-000000000092', 'species', 'Cocksfoot', '1 kg/ha');

-- Feed: a hay shed of round bales, the cows on hay.
insert into public.feed_storage_sites (id, property_id, name, site_type, capacity, capacity_unit)
values ('d0000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000001', 'Hay shed', 'hay_shed', 300, 'bales');
insert into public.feed_items (id, name, feed_type, unit, kg_per_unit) values
  ('d0000000-0000-4000-8000-000000000102', 'Pasture hay', 'hay', 'round_bale', 400);
insert into public.feed_lots (id, feed_item_id, source, received_date, dry_matter_pct, me_mj_kg, crude_protein_pct)
values ('d0000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000102', 'produced_on_farm', current_date - 120, 88, 8.5, 9);
insert into public.feed_ledger (feed_lot_id, storage_site_id, entry_date, entry_type, quantity)
values ('d0000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000101', current_date - 120, 'produced', 140);
insert into public.rations (id, name) values ('d0000000-0000-4000-8000-000000000104', 'Hay, 6 kg');
insert into public.ration_items (ration_id, feed_item_id, kg_per_head_per_day) values ('d0000000-0000-4000-8000-000000000104', 'd0000000-0000-4000-8000-000000000102', 6);
insert into public.ration_assignments (ration_id, mob_id, start_date) values ('d0000000-0000-4000-8000-000000000104', 'd0000000-0000-4000-8000-0000000000b1', current_date - 14);

-- Breeding: cows joined to the bulls and preg tested (calving in about a
-- month); the ewes in with the rams now.
insert into public.joinings (id, mob_id, sire_mob_id, paddock_id, start_date, end_date)
values ('d0000000-0000-4000-8000-000000000131', 'd0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-0000000000b2', 'd0000000-0000-4000-8000-0000000000aa', current_date - 255, current_date - 195);
insert into public.pregnancy_tests (test_date, mob_id, joining_id, tester_name, head_tested, pregnant, empty, early, mid, late)
values (current_date - 140, 'd0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-000000000131', 'Tablelands Vet (demo)', 160, 148, 12, 22, 96, 30);
insert into public.joinings (mob_id, sire_mob_id, paddock_id, start_date, end_date, notes)
values ('d0000000-0000-4000-8000-0000000000b5', 'd0000000-0000-4000-8000-0000000000b8', 'd0000000-0000-4000-8000-0000000000a2', current_date - 21, current_date + 14, '1.5% rams');

-- Vehicles: the ute has a service due next week.
insert into public.vehicles (id, name, vehicle_type, rego, reading_unit) values
  ('d0000000-0000-4000-8000-000000000111', 'Hilux', 'Ute', 'DEMO01', 'km'),
  ('d0000000-0000-4000-8000-000000000112', 'Quad bike', 'ATV', 'DEMO02', 'hours'),
  ('d0000000-0000-4000-8000-000000000113', 'Tractor', 'Tractor', null, 'hours');
insert into public.vehicle_services (vehicle_id, service_date, reading, service_type, work_done, done_by, next_due_date, next_due_reading) values
  ('d0000000-0000-4000-8000-000000000111', current_date - 170, 142000, 'Routine service', '{"Engine oil","Oil filter","Tyres"}', 'Armidale Diesel (demo)', current_date + 7, 152000),
  ('d0000000-0000-4000-8000-000000000112', current_date - 60, 410, 'Routine service', '{"Engine oil","Air filter"}', 'Sam (demo)', current_date + 120, 510),
  ('d0000000-0000-4000-8000-000000000113', current_date - 95, 3120, '250 hour service', '{"Engine oil","Fuel filter","Greased"}', 'Sam (demo)', current_date + 90, 3370);

-- Rainfall at the house gauge.
insert into public.readings (measure, value, observed_at, property_id, map_feature_id)
select 'rainfall_mm', v, (current_date - d)::timestamp + time '09:00', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000fa'
from (values (6.5, 1), (14.0, 2), (3.0, 8), (22.5, 15), (9.0, 23), (1.5, 30), (31.0, 41), (12.0, 52), (4.5, 60), (18.0, 74), (27.5, 88)) as r (v, d);

-- Satellite pasture greenness (NDVI) for each paddock, two clear days.
insert into public.readings (source, measure, value, observed_at, property_id, paddock_id, external_ref)
select 'satellite', 'ndvi_mean', round((n + case when r.d = 6 then 0.03 else 0 end)::numeric, 3), (current_date - r.d)::timestamp, 'd0000000-0000-4000-8000-000000000001', p.id::uuid, 'dea:ga_s2m_ard_3:' || (current_date - r.d)
from (values
  ('d0000000-0000-4000-8000-0000000000a1', 0.52), ('d0000000-0000-4000-8000-0000000000a2', 0.44), ('d0000000-0000-4000-8000-0000000000a3', 0.39),
  ('d0000000-0000-4000-8000-0000000000a4', 0.47), ('d0000000-0000-4000-8000-0000000000a5', 0.58), ('d0000000-0000-4000-8000-0000000000a6', 0.41),
  ('d0000000-0000-4000-8000-0000000000a7', 0.55), ('d0000000-0000-4000-8000-0000000000a8', 0.50), ('d0000000-0000-4000-8000-0000000000a9', 0.48),
  ('d0000000-0000-4000-8000-0000000000aa', 0.61), ('d0000000-0000-4000-8000-0000000000ab', 0.36), ('d0000000-0000-4000-8000-0000000000ac', 0.68)
) as p (id, n), (values (6), (16)) as r (d);

insert into public.documents (title, document_kind, document_date, review_due) values
  ('Farm biosecurity plan', 'biosecurity_plan', current_date - 340, current_date + 25),
  ('Property risk assessment', 'property_risk_assessment', current_date - 340, current_date + 25);

-- Farm problems reported from the paddock.
insert into public.issues (reported_at, categories, notes, lat, lng, property_id, paddock_id, map_feature_id, status) values
  (now() - interval '1 day', '{"Trough","Float valve"}', 'Float valve stuck, trough overflowing', -30.5640, 151.5958, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a6', 'd0000000-0000-4000-8000-0000000000f6', 'new'),
  (now() - interval '4 days', '{"Fence"}', 'Tree down over the boundary fence after the storm', -30.5545, 151.6100, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a4', null, 'in_progress'),
  (now() - interval '9 days', '{"Weeds"}', 'Blackberry patch along the gully', -30.5720, 151.5925, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000a9', null, 'new');
