-- Contractors with an open job see the job's whole property on their map:
-- every paddock boundary and the fences, gates, troughs and so on, so they
-- can find their way to the job's paddocks. Still nothing else (no stock,
-- treatments or prices), and none of it once the job is closed.
create or replace function app.my_job_properties()
returns setof uuid language sql stable security definer
set search_path = public
as $$
  select j.property_id from public.jobs j where j.id in (select app.my_open_jobs())
$$;

drop policy contractors_read on public.paddocks;
create policy contractors_read on public.paddocks for select to authenticated
  using (id in (select app.my_job_paddocks()) or property_id in (select app.my_job_properties()));

create policy contractors_read on public.map_features for select to authenticated
  using (property_id in (select app.my_job_properties()));

insert into public.schema_migrations (version, applied_by) values ('0021_contractor_map', current_user);
