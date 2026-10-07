-- Wand scan files (CSV from an RFID reader) on stock movements and counts:
-- the tags read are kept on the record (NLIS transfers now; individual
-- animals in Tier 2 later), and the original file is attached.
alter table public.stock_events
  add column if not exists scanned_eids text[];
comment on column public.stock_events.scanned_eids is 'Tags read by a wand for this movement or count (EIDs / NLIS IDs), duplicates removed.';

-- The attachments bucket also takes CSV and text files (the wand's own file).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    update storage.buckets
      set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'text/csv', 'text/plain']
      where id = 'attachments';
  end if;
end $$;

insert into public.schema_migrations (version, applied_by) values ('0023_scan_files', current_user);
