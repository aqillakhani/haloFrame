-- =============================================================================
-- EternalFrame — storage buckets
--
-- Two buckets:
--   tributes-source : user-uploaded photos (private, signed-URL access)
--   tributes-final  : completed composites (private, signed-URL access)
--
-- All policies are scoped so users can only read/write objects under their
-- own user-id prefix: <bucket>/<user_id>/<tribute_id>/<filename>
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('tributes-source', 'tributes-source', false),
  ('tributes-final', 'tributes-final', false)
on conflict (id) do nothing;

-- Helper: extract user id from object path (first segment)
-- Object names are stored as "<user_id>/<tribute_id>/<filename>"

-- tributes-source policies ----------------------------------------------------
drop policy if exists "tributes_source_select_own" on storage.objects;
create policy "tributes_source_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'tributes-source'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "tributes_source_insert_own" on storage.objects;
create policy "tributes_source_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'tributes-source'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "tributes_source_delete_own" on storage.objects;
create policy "tributes_source_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'tributes-source'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- tributes-final policies -----------------------------------------------------
-- Final composites are written by the api server (service role bypasses RLS),
-- but users can read their own.
drop policy if exists "tributes_final_select_own" on storage.objects;
create policy "tributes_final_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'tributes-final'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
