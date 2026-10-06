-- ============================================================
-- Farm Records v2 · 0012 Edit conflict fix
--
-- The app sends edit_base_updated_at with every edit: the
-- updated_at (or created_at, if never edited) of the copy it
-- edited. If the record has been saved since, the edit is flagged
-- with has_edit_conflict (it still saves, and both versions are in
-- change_log).
--
-- 0001 only checked a base that differed from the one already
-- stored, so when two phones edited the same copy offline and both
-- sent it, the second edit wasn't flagged. Now the base is used for
-- the check and then cleared, so a base on an update is always one
-- the app just sent.
-- ============================================================

create or replace function app.stamp_update()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.id         := old.id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.updated_by := auth.uid();
  -- A reason only belongs to the edit it was given with.
  if new.edit_reason is not distinct from old.edit_reason then
    new.edit_reason := null;
  end if;
  -- Flag an edit made from a copy older than the latest save.
  if new.edit_base_updated_at is not null
     and old.updated_at is not null
     and new.edit_base_updated_at < old.updated_at then
    new.has_edit_conflict := true;
  end if;
  new.edit_base_updated_at := null;
  return new;
end $$;

insert into public.schema_migrations (version, applied_by) values ('0012_edit_conflict_fix', current_user);
