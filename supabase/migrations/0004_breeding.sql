-- ============================================================
-- Farm Records v2 · 0004 Breeding (mob level, Tier 1)
--
-- Joinings, pregnancy tests and marking counts. Marking adds the
-- young to the mob through a birth_marking stock event; weaning is a
-- weaning stock event (a split by class), so neither needs more here.
-- Individual-animal results are Tier 2.
-- ============================================================

create table public.joinings (
  id                    uuid primary key default gen_random_uuid(),
  mob_id                uuid not null references public.mobs (id),
  sire_mob_id           uuid references public.mobs (id),
  sire_description      text,
  paddock_id            uuid references public.paddocks (id),
  start_date            date not null,
  end_date              date,
  expected_birth_start  date,
  expected_birth_end    date,
  notes                 text
);
call app.setup_table('joinings');
call app.farm_user_policies('joinings');

-- Expected birth dates from the gestation length in farm_settings.
create or replace function app.joining_dates()
returns trigger language plpgsql as $$
declare
  v_days int;
begin
  select (s.gestation_days ->> m.species)::int into v_days
  from public.mobs m, public.farm_settings s
  where m.id = new.mob_id;
  if v_days is not null then
    new.expected_birth_start := new.start_date + v_days;
    new.expected_birth_end := coalesce(new.end_date, new.start_date) + v_days;
  end if;
  return new;
end $$;
create trigger joinings_dates before insert or update of start_date, end_date, mob_id on public.joinings
  for each row execute function app.joining_dates();

create table public.joining_sires (
  id          uuid primary key default gen_random_uuid(),
  joining_id  uuid not null references public.joinings (id),
  animal_id   uuid not null references public.animals (id)
);
call app.setup_table('joining_sires');
call app.farm_user_policies('joining_sires');

create table public.pregnancy_tests (
  id           uuid primary key default gen_random_uuid(),
  test_date    date not null default current_date,
  mob_id       uuid not null references public.mobs (id),
  joining_id   uuid references public.joinings (id),
  tester_name  text,
  head_tested  int,
  pregnant     int,
  empty        int,
  early        int,
  mid          int,
  late         int,
  singles      int,
  twins        int,
  multiples    int,
  notes        text
);
call app.setup_table('pregnancy_tests');
call app.farm_user_policies('pregnancy_tests');

create table public.animal_pregnancy_results (
  id                 uuid primary key default gen_random_uuid(),
  pregnancy_test_id  uuid not null references public.pregnancy_tests (id),
  animal_id          uuid not null references public.animals (id),
  result             text not null check (result in ('pregnant', 'empty', 'early', 'mid', 'late', 'twins', 'multiples')),
  notes              text
);
call app.setup_table('animal_pregnancy_results');
call app.farm_user_policies('animal_pregnancy_results');

create table public.birth_markings (
  id              uuid primary key default gen_random_uuid(),
  stock_event_id  uuid not null references public.stock_events (id),
  joining_id      uuid references public.joinings (id),
  marking_date    date not null default current_date,
  males           int,
  females         int,
  notes           text
);
call app.setup_table('birth_markings');
call app.farm_user_policies('birth_markings');

insert into public.schema_migrations (version, applied_by) values ('0004_breeding', current_user);
