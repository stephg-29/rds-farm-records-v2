-- Rations as farmers feed them: an amount each feed, every so many days
-- (daily, every 2 days, weekly), either kg per head or whole units (e.g. 2
-- round bales) to the mob. kg_per_head_per_day is still kept for kg-per-head
-- items so older phones and reports keep working.
alter table public.rations
  add column if not exists feed_every_days int not null default 1 check (feed_every_days between 1 and 60);

alter table public.ration_items
  add column if not exists amount       numeric(10,2),
  add column if not exists amount_basis text not null default 'kg_per_head' check (amount_basis in ('kg_per_head', 'units_per_mob')),
  alter column kg_per_head_per_day drop not null;

alter table public.ration_items
  add constraint ration_items_amount_given check (kg_per_head_per_day is not null or amount is not null);

-- Daily use of each feed item from rations assigned today.
create or replace view public.feed_daily_use with (security_invoker = true) as
select ri.feed_item_id,
       sum(case ri.amount_basis
             when 'units_per_mob' then ri.amount * app.kg_per_unit(fi.unit, fi.kg_per_unit) / r.feed_every_days
             else coalesce(ri.kg_per_head_per_day, ri.amount / r.feed_every_days) * greatest(t.head, 0)
           end) as kg_per_day
from public.ration_assignments ra
join public.rations r on r.id = ra.ration_id
join public.ration_items ri on ri.ration_id = ra.ration_id and ri.deleted_at is null
join public.feed_items fi on fi.id = ri.feed_item_id
join public.mob_totals t on t.mob_id = ra.mob_id
where ra.deleted_at is null
  and ra.start_date <= current_date
  and (ra.end_date is null or ra.end_date >= current_date)
group by ri.feed_item_id;

insert into public.schema_migrations (version, applied_by) values ('0019_feed_amounts', current_user);
