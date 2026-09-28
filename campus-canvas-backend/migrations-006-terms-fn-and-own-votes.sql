-- Migration 006: fixes "function current_terms_version() does not exist"
-- when voting, and lets students vote on their own photos. Safe to re-run.

-- The Terms of Use version everyone must have accepted before taking part.
-- Keep in sync with TERMS_VERSION in campus-canvas-app/js/terms-content.js.
create or replace function public.current_terms_version() returns text
language sql immutable as $$ select '2026-09-16'::text $$;

-- Same thing under the singular name, in case anything older calls it that.
create or replace function public.current_term_version() returns text
language sql immutable as $$ select public.current_terms_version() $$;

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

revoke all on function public.cast_vote(uuid, text, text) from public, anon;
grant execute on function public.cast_vote(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- Should show 2026-09-16 if everything worked.
select public.current_terms_version() as terms_version_now_required;
