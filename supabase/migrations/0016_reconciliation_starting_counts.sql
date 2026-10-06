-- ============================================================
-- Farm Records v2 · 0016 Reconciliation: starting counts
--
-- A farm that starts using the app part-way through a year enters
-- the stock it already has as starting counts (count_adjustment,
-- reason 'opening_count'). Those are stock on hand, not changes, so
-- they count as Opening for the period they fall in, not Other.
-- ============================================================

create or replace function public.livestock_reconciliation(p_from date, p_to date)
returns table (species text, class_name text, opening int, births int, purchases int, sales int,
               deaths int, other_changes int, closing int)
language sql stable security invoker
set search_path = public
as $$
  with lines as (
    select m.species, c.name as class_name, l.event_date, l.event_type, l.reason, l.head_change,
           (l.event_type = 'count_adjustment' and l.reason = 'opening_count') as starting
    from public.live_stock_lines l
    join public.mobs m on m.id = l.mob_id
    left join public.livestock_classes c on c.id = l.livestock_class_id
  )
  select species, coalesce(class_name, '(no class)'),
    coalesce(sum(head_change) filter (where event_date < p_from or (starting and event_date <= p_to)), 0)::int,
    coalesce(sum(head_change) filter (where event_date between p_from and p_to and event_type = 'birth_marking'), 0)::int,
    coalesce(sum(head_change) filter (where event_date between p_from and p_to and event_type = 'arrival'), 0)::int,
    coalesce(-sum(head_change) filter (where event_date between p_from and p_to and event_type = 'exit'), 0)::int,
    coalesce(-sum(head_change) filter (where event_date between p_from and p_to and event_type = 'death'), 0)::int,
    coalesce(sum(head_change) filter (where event_date between p_from and p_to and not starting
                                      and event_type not in ('birth_marking', 'arrival', 'exit', 'death')), 0)::int,
    coalesce(sum(head_change) filter (where event_date <= p_to), 0)::int
  from lines
  group by species, class_name
  order by species, class_name
$$;

insert into public.schema_migrations (version, applied_by) values ('0016_reconciliation_starting_counts', current_user);
