-- ============================================================
-- Farm Records v2 · 0015 Spray record fields
--
-- The NSW Pesticides Regulation 2017 record also asks for the time
-- spraying finished and the equipment used. (The record is the
-- farmer's; the app doesn't claim compliance.)
-- ============================================================

alter table public.spray_records
  add column if not exists finish_time time,
  add column if not exists equipment   text;

insert into public.schema_migrations (version, applied_by) values ('0015_spray_record_fields', current_user);
