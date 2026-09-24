-- Migration 002: everyone must accept the current Terms of Use before voting,
-- reading notices, sending feedback or submitting. Safe to re-run.

-- The Terms of Use version everyone must have accepted before taking part.
-- Keep in sync with TERMS_VERSION in campus-canvas-app/js/terms-content.js.
create or replace function public.current_terms_version() returns text
language sql immutable as $$ select '2026-09-16'::text $$;

-- A registered participant who has accepted the current terms (FR-004).
create or replace function public.require_agreed_participant() returns public.participants
language plpgsql stable security definer set search_path = public as $$
declare p public.participants := public.require_participant();
begin
  if p.terms_version is distinct from public.current_terms_version() then
    raise exception 'Please accept the current Terms of Use to continue' using errcode = '42501';
  end if;
  return p;
end $$;

create or replace function public.accept_terms(p_version text)
returns public.participants
language plpgsql security definer set search_path = public as $$
declare p public.participants := public.require_participant();
begin
  if p_version is distinct from public.current_terms_version() then
    raise exception 'That is not the current version of the Terms of Use';
  end if;
  update public.participants set terms_version = p_version, terms_accepted_at = now()
  where id = p.id returning * into p;
  insert into public.audit_log (actor, action, entity, detail)
  values (p.email, 'accept_terms', p.id::text, jsonb_build_object('version', p_version));
  return p;
end $$;

create or replace function public.submit_entry(p_items jsonb, p_terms_version text)
returns setof public.images
language plpgsql security definer set search_path = public as $$
declare
  p public.participants := public.require_agreed_participant();
  item jsonb;
  v_title text;
  v_desc text;
  v_img public.images;
begin
  if exists (select 1 from public.images where participant_id = p.id) then
    raise exception 'You have already submitted your three photos';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) <> 3 then
    raise exception 'An entry must contain exactly three photos';
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    v_title := btrim(coalesce(item->>'title', ''));
    v_desc := btrim(coalesce(item->>'description', ''));
    if v_title = '' or char_length(v_title) > 80 then raise exception 'Each photo needs a title (80 characters max)'; end if;
    if v_desc = '' then raise exception 'Each photo needs a description'; end if;
    if public.word_count(v_desc) > 200 then raise exception 'Descriptions are limited to 200 words'; end if;
    if coalesce(item->>'storage_path', '') not like 'submissions/' || auth.uid()::text || '/%' then
      raise exception 'Photo upload is missing';
    end if;

    insert into public.images (participant_id, source, credit, storage_path, photo_url, title, description)
    values (p.id, 'participant', p.name, item->>'storage_path', item->>'photo_url', v_title, v_desc)
    returning * into v_img;
    return next v_img;
  end loop;

  update public.participants set points = points + 9 where id = p.id;
  insert into public.audit_log (actor, action, entity, detail)
  values (p.email, 'submit_entry', p.id::text, jsonb_build_object('count', 3));
end $$;

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

  insert into public.votes (participant_id, image_id, value, note)
  values (p.id, p_image, p_value, coalesce(btrim(p_note), ''))
  on conflict do nothing;
  get diagnostics v_rows = row_count;

  -- FR-033: a repeat vote is a no-op and earns nothing.
  if v_rows > 0 then
    update public.participants
    set points = points + case when p_value = 'note' then 3 else 1 end
    where id = p.id returning points into p.points;
  end if;
  return p.points;
end $$;

create or replace function public.reset_my_votes() returns int
language plpgsql security definer set search_path = public as $$
declare
  p public.participants := public.require_agreed_participant();
  v_reclaim int;
  v_count int;
begin
  select coalesce(sum(case when value = 'note' then 3 else 1 end), 0), count(*)
  into v_reclaim, v_count from public.votes where participant_id = p.id;
  delete from public.votes where participant_id = p.id;
  update public.participants set points = greatest(0, points - v_reclaim)
  where id = p.id returning points into p.points;
  insert into public.audit_log (actor, action, entity, detail)
  values (p.email, 'reset_votes', p.id::text, jsonb_build_object('removed', v_count));
  return p.points;
end $$;

create or replace function public.set_test_points(p_target int) returns int
language plpgsql security definer set search_path = public as $$
declare p public.participants := public.require_agreed_participant();
begin
  if p_target > p.points then
    update public.participants set points = least(p_target, 1000)
    where id = p.id returning points into p.points;
    insert into public.audit_log (actor, action, entity, detail)
    values (p.email, 'add_test_points', p.id::text, jsonb_build_object('total', p.points));
  end if;
  return p.points;
end $$;

create or replace function public.mark_notice_read(p_notice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.participants := public.require_agreed_participant();
begin
  insert into public.notice_reads (participant_id, notice_id) values (p.id, p_notice)
  on conflict do nothing;
end $$;

create or replace function public.submit_feedback(p_category text, p_message text)
returns public.feedback
language plpgsql security definer set search_path = public as $$
declare
  p public.participants := public.require_agreed_participant();
  f public.feedback;
begin
  insert into public.feedback (participant_id, category, message)
  values (p.id, left(btrim(p_category), 60), btrim(p_message)) returning * into f;
  insert into public.audit_log (actor, action, entity, detail)
  values (p.email, 'submit_feedback', f.id::text, jsonb_build_object('category', f.category));
  return f;
end $$;

select public.current_terms_version() as terms_version_now_required;
