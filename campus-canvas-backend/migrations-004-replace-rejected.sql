-- Migration 004: a student can swap a rejected photo for a new one, which
-- goes back to the review queue. Safe to re-run.

create or replace function public.replace_rejected_image(
  p_image uuid, p_storage_path text, p_photo_url text, p_title text, p_description text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  p public.participants := public.require_agreed_participant();
  v_old public.images;
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := btrim(coalesce(p_description, ''));
begin
  select * into v_old from public.images where id = p_image and participant_id = p.id;
  if v_old.id is null then raise exception 'Photo not found'; end if;
  if v_old.status <> 'rejected' then raise exception 'Only a photo that was not accepted can be replaced'; end if;
  if v_title = '' or char_length(v_title) > 80 then raise exception 'Each photo needs a title (80 characters max)'; end if;
  if v_desc = '' then raise exception 'Each photo needs a description'; end if;
  if public.word_count(v_desc) > 200 then raise exception 'Descriptions are limited to 200 words'; end if;
  if coalesce(p_storage_path, '') not like 'submissions/' || auth.uid()::text || '/%' then
    raise exception 'Photo upload is missing';
  end if;

  update public.images
  set storage_path = p_storage_path, photo_url = p_photo_url, title = v_title, description = v_desc,
      status = 'pending', submitted_at = now(), reviewed_at = null
  where id = p_image;
  -- The old review note and any votes belonged to the old photo.
  delete from public.image_reviews where image_id = p_image;
  delete from public.votes where image_id = p_image;
  insert into public.audit_log (actor, action, entity, detail)
  values (p.email, 'replace_image', p_image::text, jsonb_build_object('title', v_title));
  -- The caller removes the old file from storage.
  return v_old.storage_path;
end $$;

revoke all on function public.replace_rejected_image(uuid, text, text, text, text) from public, anon;
grant execute on function public.replace_rejected_image(uuid, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
