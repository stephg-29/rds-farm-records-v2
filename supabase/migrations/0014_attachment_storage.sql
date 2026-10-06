-- ============================================================
-- Farm Records v2 · 0014 Photo and file storage
--
-- A private Supabase Storage bucket for attachments (issue photos,
-- NVD photos, agronomist reports). Files are stored at
--   <record table>/<record id>/<attachment id>-<file name>
-- and listed in public.attachments / attachment_links. Owners and
-- staff can add and read files; nobody else (contractors included).
-- Files are never deleted from the app: the attachment row is
-- marked deleted instead.
--
-- Skipped where Supabase Storage isn't installed (the offline test
-- database).
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'No storage schema: skipping the attachments bucket.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('attachments', 'attachments', false, 15728640,
          array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
  on conflict (id) do update
    set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$create policy attachments_read on storage.objects for select to authenticated
           using (bucket_id = 'attachments' and app.is_farm_user())$p$;
  execute $p$create policy attachments_add on storage.objects for insert to authenticated
           with check (bucket_id = 'attachments' and app.is_farm_user())$p$;
end $$;

insert into public.schema_migrations (version, applied_by) values ('0014_attachment_storage', current_user);
