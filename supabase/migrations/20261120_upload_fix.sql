-- ============================================================================
-- ManiPOS · Storage upload fix (20 Nov 2026)
-- ============================================================================
-- PIN-session staff authenticate as `anon` (no Supabase Auth JWT), so the
-- tenant-scoped storage policy rejected every microsite/catalog upload with
-- "new row violates row-level security". Uploads now go to a public/ prefix
-- that both anon and authenticated roles may write, while authenticated
-- tenant folders keep their existing scoping.
-- ============================================================================

-- anon (PIN session) uploads: public scratch prefix only.
drop policy if exists "Public microsite uploads" on storage.objects;
create policy "Public microsite uploads"
  on storage.objects for insert to anon
  with check (bucket_id = 'menu_images' and name like 'public/%');

-- authenticated uploads: tenant folder OR the shared public prefix.
drop policy if exists "Staff manage menu images" on storage.objects;
create policy "Staff manage menu images"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'menu_images'
    and (
      name like 'public/%'
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '') = ''
      or name like (auth.jwt() -> 'app_metadata' ->> 'tenant_id') || '/%'
      or name like 'receipts/' || (auth.jwt() -> 'app_metadata' ->> 'tenant_id') || '/%'
    )
  )
  with check (
    bucket_id = 'menu_images'
    and (
      name like 'public/%'
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '') = ''
      or name like (auth.jwt() -> 'app_metadata' ->> 'tenant_id') || '/%'
      or name like 'receipts/' || (auth.jwt() -> 'app_metadata' ->> 'tenant_id') || '/%'
    )
  );
