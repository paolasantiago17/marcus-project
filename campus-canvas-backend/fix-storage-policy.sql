-- Students may read/delete files in their own submissions/<uid>/ folder;
-- admins may read/delete anything in the bucket.
drop policy if exists photos_owner_read on storage.objects;
create policy photos_owner_read on storage.objects for select to authenticated
  using (
    bucket_id = 'photos' and (
      ((storage.foldername(name))[1] = 'submissions' and (storage.foldername(name))[2] = auth.uid()::text)
      or public.is_admin()
    )
  );

drop policy if exists photos_owner_delete on storage.objects;
create policy photos_owner_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos' and (
      ((storage.foldername(name))[1] = 'submissions' and (storage.foldername(name))[2] = auth.uid()::text)
      or public.is_admin()
    )
  );

-- Read-only helper so the setup scripts (secret key only) can confirm which
-- storage policies are installed.
create or replace function public.storage_policy_report()
returns table (policyname name, cmd text, roles name[], qual text, with_check text)
language sql stable security definer set search_path = pg_catalog as $$
  select policyname, cmd, roles, qual, with_check from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like 'photos_%'
  order by policyname;
$$;
revoke all on function public.storage_policy_report() from public, anon, authenticated;
grant execute on function public.storage_policy_report() to service_role;

select * from public.storage_policy_report();
