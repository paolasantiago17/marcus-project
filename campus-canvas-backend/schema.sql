-- Campus Canvas — Supabase schema.
-- Safe to re-run: tables use IF NOT EXISTS, functions/policies are replaced.
--
-- Security model
--   * Students sign in anonymously (one auth user per browser) and are bound
--     to a participant row by email (FR-002). Every student write goes
--     through a SECURITY DEFINER function that enforces the contest rules
--     server-side (SR-005): terms before submission, exactly three images,
--     one counted vote per image, no voting on your own images.
--   * Admins are real email/password users listed in public.admins. They
--     read everything through RLS and write through admin_* functions, which
--     also write the audit log (AR-007).
--   * Internal review notes live in image_reviews, which only admins can read.

create extension if not exists citext;

-- ---------------------------------------------------------------- tables

create table if not exists public.admins (
  user_id    uuid primary key references auth.users on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id                uuid primary key default gen_random_uuid(),
  auth_uid          uuid unique references auth.users on delete set null,
  name              text not null,
  email             citext not null unique,
  registered_at     timestamptz not null default now(),
  terms_version     text,
  terms_accepted_at timestamptz,
  points            int not null default 0,
  is_seed           boolean not null default false
);

create table if not exists public.images (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid references public.participants on delete cascade,
  source         text not null default 'participant' check (source in ('participant', 'admin')),
  credit         text not null default '',
  storage_path   text,
  photo_url      text not null,
  title          text not null,
  description    text not null default '',
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  submitted_at   timestamptz not null default now(),
  reviewed_at    timestamptz
);
create index if not exists images_status_idx on public.images (status);
create index if not exists images_participant_idx on public.images (participant_id);

create table if not exists public.image_reviews (
  image_id    uuid primary key references public.images on delete cascade,
  reviewed_by text,
  note        text not null default '',
  updated_at  timestamptz not null default now()
);

create table if not exists public.votes (
  participant_id uuid not null references public.participants on delete cascade,
  image_id       uuid not null references public.images on delete cascade,
  value          text not null check (value in ('like', 'pass', 'note')),
  note           text not null default '',
  voted_at       timestamptz not null default now(),
  primary key (participant_id, image_id)
);
create index if not exists votes_image_idx on public.votes (image_id);

create table if not exists public.notices (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  category     text not null default 'Announcement',
  cta_label    text not null default '',
  url          text not null default '',
  status       text not null default 'live' check (status in ('live', 'retired')),
  published_at timestamptz not null default now()
);

create table if not exists public.notice_reads (
  participant_id uuid not null references public.participants on delete cascade,
  notice_id      uuid not null references public.notices on delete cascade,
  read_at        timestamptz not null default now(),
  primary key (participant_id, notice_id)
);

create table if not exists public.feedback (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants on delete cascade,
  category       text not null,
  message        text not null check (char_length(message) between 1 and 1000),
  status         text not null default 'open' check (status in ('open', 'resolved')),
  submitted_at   timestamptz not null default now()
);

create table if not exists public.audit_log (
  id     bigint generated always as identity primary key,
  actor  text not null,
  action text not null,
  entity text not null,
  detail jsonb not null default '{}'::jsonb,
  at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.current_participant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.participants where auth_uid = auth.uid();
$$;

create or replace function public.require_admin() returns text
language plpgsql stable security definer set search_path = public as $$
declare v_email text;
begin
  select email into v_email from public.admins where user_id = auth.uid();
  if v_email is null then raise exception 'Admin access required' using errcode = '42501'; end if;
  return v_email;
end $$;

create or replace function public.require_participant() returns public.participants
language plpgsql stable security definer set search_path = public as $$
declare p public.participants;
begin
  select * into p from public.participants where auth_uid = auth.uid();
  if p.id is null then raise exception 'Register before continuing' using errcode = '42501'; end if;
  return p;
end $$;

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

create or replace function public.word_count(t text) returns int
language sql immutable as $$
  select case when btrim(coalesce(t, '')) = '' then 0
              else array_length(regexp_split_to_array(btrim(t), '\s+'), 1) end;
$$;

-- ---------------------------------------------------------------- RLS

alter table public.admins        enable row level security;
alter table public.participants  enable row level security;
alter table public.images        enable row level security;
alter table public.image_reviews enable row level security;
alter table public.votes         enable row level security;
alter table public.notices       enable row level security;
alter table public.notice_reads  enable row level security;
alter table public.feedback      enable row level security;
alter table public.audit_log     enable row level security;

drop policy if exists admins_read on public.admins;
create policy admins_read on public.admins for select using (user_id = auth.uid());

drop policy if exists participants_read on public.participants;
create policy participants_read on public.participants for select
  using (auth_uid = auth.uid() or public.is_admin());

drop policy if exists images_read on public.images;
create policy images_read on public.images for select
  using (status = 'accepted' or participant_id = public.current_participant_id() or public.is_admin());

drop policy if exists image_reviews_read on public.image_reviews;
create policy image_reviews_read on public.image_reviews for select using (public.is_admin());

drop policy if exists votes_read on public.votes;
create policy votes_read on public.votes for select
  using (participant_id = public.current_participant_id() or public.is_admin());

drop policy if exists notices_read on public.notices;
create policy notices_read on public.notices for select using (status = 'live' or public.is_admin());

drop policy if exists notice_reads_read on public.notice_reads;
create policy notice_reads_read on public.notice_reads for select
  using (participant_id = public.current_participant_id() or public.is_admin());

drop policy if exists feedback_read on public.feedback;
create policy feedback_read on public.feedback for select
  using (participant_id = public.current_participant_id() or public.is_admin());

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select using (public.is_admin());

-- No insert/update/delete policies: every write goes through the functions
-- below, which run as the table owner.

-- ---------------------------------------------------------------- student functions

create or replace function public.register_participant(p_name text, p_email text)
returns public.participants
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name);
  v_email citext := lower(btrim(p_email));
  p public.participants;
begin
  if v_uid is null then raise exception 'No session' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'Name is required'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Email is not valid'; end if;
  if v_email !~ '@queensu\.ca$' then raise exception 'Please use your @queensu.ca email to take part'; end if;

  -- One participant per browser session: release any other row this session held.
  update public.participants set auth_uid = null where auth_uid = v_uid and email <> v_email;

  select * into p from public.participants where email = v_email;
  if p.id is null then
    insert into public.participants (auth_uid, name, email)
    values (v_uid, v_name, v_email) returning * into p;
    insert into public.audit_log (actor, action, entity, detail)
    values (v_email, 'register', p.id::text, jsonb_build_object('name', v_name));
  else
    -- FR-002: a duplicate email resolves to the existing participant.
    update public.participants set auth_uid = v_uid, name = v_name
    where id = p.id returning * into p;
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

-- p_items: [{ "storage_path", "photo_url", "title", "description" }, x3]
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

-- Testing aid for the tier/reward UI; remove before a real campus launch.
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

-- Returns the storage paths the caller should delete from the bucket.
create or replace function public.delete_my_data() returns text[]
language plpgsql security definer set search_path = public as $$
declare
  p public.participants := public.require_participant();
  v_paths text[];
begin
  select coalesce(array_agg(storage_path), '{}') into v_paths
  from public.images where participant_id = p.id and storage_path is not null;
  delete from public.participants where id = p.id;
  insert into public.audit_log (actor, action, entity, detail)
  values ('participant', 'delete_participant', p.id::text, '{}'::jsonb);
  return v_paths;
end $$;

-- ---------------------------------------------------------------- admin functions

create or replace function public.admin_review_image(p_image uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_admin text := public.require_admin();
begin
  if p_status not in ('pending', 'accepted', 'rejected') then raise exception 'Unknown status'; end if;
  update public.images
  set status = p_status, reviewed_at = case when p_status = 'pending' then null else now() end
  where id = p_image;
  insert into public.image_reviews (image_id, reviewed_by, note)
  values (p_image, v_admin, coalesce(p_note, ''))
  on conflict (image_id) do update
    set reviewed_by = excluded.reviewed_by,
        note = coalesce(p_note, public.image_reviews.note),
        updated_at = now();
  insert into public.audit_log (actor, action, entity, detail)
  values (v_admin, 'review_image', p_image::text, jsonb_build_object('status', p_status, 'note', p_note));
end $$;

create or replace function public.admin_update_image(p_image uuid, p_title text, p_description text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_admin text := public.require_admin();
begin
  if btrim(coalesce(p_title, '')) = '' then raise exception 'Title is required'; end if;
  if btrim(coalesce(p_description, '')) = '' then raise exception 'Description is required'; end if;
  update public.images set title = left(btrim(p_title), 80), description = btrim(p_description)
  where id = p_image;
  insert into public.audit_log (actor, action, entity, detail)
  values (v_admin, 'edit_image', p_image::text, jsonb_build_object('title', btrim(p_title)));
end $$;

-- Curator-sourced photo that goes straight into the voting catalogue.
create or replace function public.admin_add_catalog_image(
  p_storage_path text, p_photo_url text, p_title text, p_description text, p_credit text
) returns public.images
language plpgsql security definer set search_path = public as $$
declare
  v_admin text := public.require_admin();
  v_img public.images;
begin
  if btrim(coalesce(p_title, '')) = '' then raise exception 'Title is required'; end if;
  if btrim(coalesce(p_description, '')) = '' then raise exception 'Description is required'; end if;
  insert into public.images (source, credit, storage_path, photo_url, title, description, status, reviewed_at)
  values ('admin', coalesce(nullif(btrim(p_credit), ''), 'ArtUP'), p_storage_path, p_photo_url,
          left(btrim(p_title), 80), btrim(p_description), 'accepted', now())
  returning * into v_img;
  insert into public.image_reviews (image_id, reviewed_by) values (v_img.id, v_admin);
  insert into public.audit_log (actor, action, entity, detail)
  values (v_admin, 'add_catalog_image', v_img.id::text, jsonb_build_object('title', v_img.title));
  return v_img;
end $$;

create or replace function public.admin_publish_notice(
  p_title text, p_body text, p_category text, p_cta_label text, p_url text
) returns public.notices
language plpgsql security definer set search_path = public as $$
declare
  v_admin text := public.require_admin();
  n public.notices;
begin
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_body, '')) = '' then
    raise exception 'A notice needs a title and a message';
  end if;
  insert into public.notices (title, body, category, cta_label, url)
  values (btrim(p_title), btrim(p_body), coalesce(nullif(btrim(p_category), ''), 'Announcement'),
          coalesce(btrim(p_cta_label), ''), coalesce(btrim(p_url), ''))
  returning * into n;
  insert into public.audit_log (actor, action, entity, detail)
  values (v_admin, 'publish_notice', n.id::text, jsonb_build_object('title', n.title));
  return n;
end $$;

create or replace function public.admin_retire_notice(p_notice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_admin text := public.require_admin();
begin
  update public.notices set status = 'retired' where id = p_notice;
  insert into public.audit_log (actor, action, entity, detail)
  values (v_admin, 'retire_notice', p_notice::text, '{}'::jsonb);
end $$;

create or replace function public.admin_set_feedback_status(p_feedback uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_admin text := public.require_admin();
begin
  update public.feedback set status = p_status where id = p_feedback;
  insert into public.audit_log (actor, action, entity, detail)
  values (v_admin, 'feedback_status', p_feedback::text, jsonb_build_object('status', p_status));
end $$;

-- Lock function execution down to signed-in users (anonymous students count).
do $$
declare fn text;
begin
  foreach fn in array array[
    'register_participant(text,text)', 'accept_terms(text)', 'submit_entry(jsonb,text)',
    'cast_vote(uuid,text,text)', 'reset_my_votes()', 'set_test_points(int)',
    'mark_notice_read(uuid)', 'submit_feedback(text,text)', 'delete_my_data()',
    'admin_review_image(uuid,text,text)', 'admin_update_image(uuid,text,text)',
    'admin_add_catalog_image(text,text,text,text,text)',
    'admin_publish_notice(text,text,text,text,text)', 'admin_retire_notice(uuid)',
    'admin_set_feedback_status(uuid,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists photos_student_upload on storage.objects;
create policy photos_student_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists photos_admin_upload on storage.objects;
create policy photos_admin_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_admin());

-- Students may read/delete files in their own submissions/<uid>/ folder
-- (storage only deletes what the caller can also select); admins, anything.
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
