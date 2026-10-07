-- Each person's own app settings (their Home layout and bottom bar), so
-- they follow the person to any phone. One row per person, keyed by their
-- user id, readable and editable only by them.
create table public.user_preferences (
  id     uuid primary key default auth.uid(),
  prefs  jsonb not null default '{}'
);
call app.setup_table('user_preferences');
create policy own_read on public.user_preferences for select to authenticated using (id = auth.uid());
create policy own_add on public.user_preferences for insert to authenticated with check (id = auth.uid());
create policy own_edit on public.user_preferences for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

insert into public.schema_migrations (version, applied_by) values ('0020_user_preferences', current_user);
