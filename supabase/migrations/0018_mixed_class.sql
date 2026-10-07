-- A "Mixed" livestock class for mobs that run together (e.g. cows with
-- steers), so a mob doesn't have to be split into classes to be recorded.
insert into public.livestock_classes (species, name, sex, sort_order) values
  ('cattle', 'Mixed', 'mixed', 90), ('sheep', 'Mixed', 'mixed', 90), ('goat', 'Mixed', 'mixed', 90)
on conflict (species, name) do nothing;

insert into public.schema_migrations (version, applied_by) values ('0018_mixed_class', current_user);
