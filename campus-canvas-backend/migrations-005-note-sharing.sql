-- Migration 005: voters' notes can be shown to everyone, anonymously, once
-- an admin approves them. Votes can no longer be reset. Safe to re-run.

-- private  = written before notes could be shared; never shown to others
-- pending  = waiting for an admin; approved / rejected = the admin's call
alter table public.votes add column if not exists note_status text not null default 'private';
alter table public.votes drop constraint if exists votes_note_status_check;
alter table public.votes add constraint votes_note_status_check
  check (note_status in ('private', 'pending', 'approved', 'rejected'));

create or replace function public.cast_vote(p_image uuid, p_value text, p_note text default '')
returns int
language plpgsql security definer set search_path = public as $$
declare
  p public.participants := public.require_agreed_participant();
  v_img public.images;
  v_rows int;
begin
  if p_value not in ('like', 'pass', 'note') then raise exception 'Unknown vote'; end if;
  if p_value = 'note' and btrim(coalesce(p_note, '')) = '' then raise exception 'A note needs some text'; end if;
  select * into v_img from public.images where id = p_image;
  if v_img.id is null or v_img.status <> 'accepted' then raise exception 'That image is not open for voting'; end if;
  if v_img.participant_id = p.id then raise exception 'You cannot vote on your own photo'; end if;

  insert into public.votes (participant_id, image_id, value, note, note_status)
  values (p.id, p_image, p_value, coalesce(btrim(p_note), ''),
          case when p_value = 'note' then 'pending' else 'private' end)
  on conflict do nothing;
  get diagnostics v_rows = row_count;

  -- A repeat vote is a no-op and earns nothing.
  if v_rows > 0 then
    update public.participants
    set points = points + case when p_value = 'note' then 3 else 1 end
    where id = p.id returning points into p.points;
  end if;
  return p.points;
end $$;

-- Approved notes for photos in voting. Never says who wrote them.
create or replace function public.public_notes()
returns table (image_id uuid, note text, voted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select v.image_id, v.note, v.voted_at
  from public.votes v join public.images i on i.id = v.image_id
  where v.value = 'note' and v.note_status = 'approved' and i.status = 'accepted'
  order by v.voted_at desc;
$$;

create or replace function public.admin_set_note_status(p_participant uuid, p_image uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_admin text := public.require_admin();
begin
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'Unknown status'; end if;
  update public.votes set note_status = p_status
  where participant_id = p_participant and image_id = p_image and value = 'note' and note_status <> 'private';
  if not found then raise exception 'That note can''t be shared'; end if;
  insert into public.audit_log (actor, action, entity, detail)
  values (v_admin, 'note_status', p_image::text,
          jsonb_build_object('status', p_status, 'participant', p_participant));
end $$;

-- Votes are final now, and points can only be earned.
drop function if exists public.reset_my_votes();
drop function if exists public.set_test_points(int);

revoke all on function public.cast_vote(uuid, text, text) from public, anon;
grant execute on function public.cast_vote(uuid, text, text) to authenticated;
revoke all on function public.public_notes() from public, anon;
grant execute on function public.public_notes() to authenticated;
revoke all on function public.admin_set_note_status(uuid, uuid, text) from public, anon;
grant execute on function public.admin_set_note_status(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
