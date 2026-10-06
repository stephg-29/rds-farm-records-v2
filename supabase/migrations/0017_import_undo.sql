-- ============================================================
-- Farm Records v2 · 0017 Undoing an import
--
-- Each import (v1 Farm Records sheets, Fence Map data) lists the
-- records it created, so the whole import can be undone (marked
-- deleted, as everywhere else) if it went wrong.
--   [{ "table": "treatments", "id": "…" }, …]
-- Boundaries it drew onto existing paddocks are listed with
-- "cleared": "boundary" so undo can remove them again.
-- ============================================================

alter table public.import_batches
  add column if not exists created_records jsonb not null default '[]',
  add column if not exists undone_at        timestamptz;

insert into public.schema_migrations (version, applied_by) values ('0017_import_undo', current_user);
