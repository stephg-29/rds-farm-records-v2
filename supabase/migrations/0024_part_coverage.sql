-- Part of a paddock done: a spray or fertiliser run that stopped partway
-- (rain, wind, ran out). Each paddock on the record is all of it or part,
-- with roughly how much was done and why; a part-done paddock stays open on
-- its contractor job. Grazing withholds still cover the whole paddock.
alter table public.spray_record_paddocks
  add column if not exists coverage     text not null default 'full' check (coverage in ('full', 'part')),
  add column if not exists area_done_ha numeric(8,2),
  add column if not exists part_reason  text;
alter table public.pasture_record_paddocks
  add column if not exists coverage     text not null default 'full' check (coverage in ('full', 'part')),
  add column if not exists area_done_ha numeric(8,2),
  add column if not exists part_reason  text;

-- "Issues" read like problems with the app: they're problems on the farm.
update public.modules set name = 'Farm problems', description = 'Report problems on the farm (fences, water, stock) with GPS and photos' where key = 'issues';

insert into public.schema_migrations (version, applied_by) values ('0024_part_coverage', current_user);
