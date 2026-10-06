-- ============================================================
-- Farm Records v2 · 0013 Recounts
--
-- A move or count that didn't match the book can be left as
-- "recount later", which raises a reminder. When the recount is
-- done, the app marks the original record 'recounted' so the
-- reminder clears (any difference found is recorded as its own
-- adjustment, linked by related_event_id).
-- ============================================================

alter table public.stock_events drop constraint stock_events_discrepancy_action_check;
alter table public.stock_events add constraint stock_events_discrepancy_action_check
  check (discrepancy_action in ('recount_later', 'accepted', 'recounted'));

insert into public.schema_migrations (version, applied_by) values ('0013_recounted', current_user);
