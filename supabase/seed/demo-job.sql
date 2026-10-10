-- ============================================================
-- Farm Records v2 · demo farm contractor job
--
-- For the app's built-in demo only (scripts/build-demo-data.mjs runs
-- it after demo.sql in a scratch database, once the made-up demo
-- people exist). Needs a contractor login, so not for a demo project.
-- ============================================================

-- Blackberry and tussock spraying on Top hill and Back gully. The
-- contractor finished Top hill yesterday; rain stopped Back gully partway.
insert into public.jobs (id, job_type, contractor_user_id, property_id, start_date, end_date, status, instructions)
values ('d0000000-0000-4000-8000-000000000141', 'spray', 'd0000000-0000-4000-8000-0000000001a3', 'd0000000-0000-4000-8000-000000000001',
        current_date - 3, current_date + 7, 'open',
        'Spot spray blackberry and serrated tussock. Enter by the Road paddock gate and keep to the lane; Back gully is the steep one, go slow. Ring Alex before starting.');
insert into public.job_paddocks (job_id, paddock_id) values
  ('d0000000-0000-4000-8000-000000000141', 'd0000000-0000-4000-8000-0000000000a1'),
  ('d0000000-0000-4000-8000-000000000141', 'd0000000-0000-4000-8000-0000000000a9');

insert into public.spray_records (id, spray_date, start_time, finish_time, property_id, situation, target, water_rate, area_ha, wind_speed_direction, temperature_c, humidity_delta_t, equipment, applicator_name, licence_number, job_id, contractor_entered)
values ('d0000000-0000-4000-8000-000000000082', current_date - 1, '06:45', '10:30', 'd0000000-0000-4000-8000-000000000001', 'Pasture', 'Blackberry, serrated tussock', '1000 L/ha (spot)', 59.3, '6 km/h E', 16, 'Delta T 3', 'Spot sprayer on ute', 'Chris Ridge', 'NSW-ACU-00001', 'd0000000-0000-4000-8000-000000000141', true);
insert into public.spray_record_paddocks (spray_record_id, paddock_id, coverage, area_done_ha, part_reason) values
  ('d0000000-0000-4000-8000-000000000082', 'd0000000-0000-4000-8000-0000000000a1', 'full', null, null),
  ('d0000000-0000-4000-8000-000000000082', 'd0000000-0000-4000-8000-0000000000a9', 'part', 18, 'Rain');
insert into public.spray_record_items (spray_record_id, product_id, batch_id, application_rate, quantity_used, grazing_whp_days)
values ('d0000000-0000-4000-8000-000000000082', 'd0000000-0000-4000-8000-0000000000c7', 'd0000000-0000-4000-8000-0000000000d7', '500 mL/100 L', 4.5, 7);
