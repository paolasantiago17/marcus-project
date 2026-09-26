-- Migration 003, part 1 of 2: who can take part. Safe to re-run.
-- Run migrations-003b-login.sql straight after this one.
--
-- * @queensu.ca addresses are approved as soon as they register. Any other
--   address can still sign up, but waits for an admin to approve or reject it.
-- * Everyone registered before this migration stays approved.
-- * New sign-ups confirm they're 18 or older.
-- * claim_participant logs someone back in to their account once they've
--   signed in with the magic link (or code) Supabase Auth emails them.

alter table public.participants add column if not exists access text not null default 'approved';
alter table public.participants add column if not exists age_confirmed_at timestamptz;
alter table public.participants drop constraint if exists participants_access_check;
alter table public.participants add constraint participants_access_check
  check (access in ('approved', 'pending', 'rejected'));

-- A registered participant who has accepted the current terms (FR-004) and
-- whose access is approved. Everything but accepting terms and deleting your
-- data goes through this.
create or replace function public.require_agreed_participant() returns public.participants
language plpgsql stable security definer set search_path = public as $$
declare p public.participants := public.require_participant();
begin
  if p.access = 'pending' then
    raise exception 'Your account is waiting for approval from the ArtUP team' using errcode = '42501';
  elsif p.access = 'rejected' then
    raise exception 'This email was not approved for Campus Canvas' using errcode = '42501';
  end if;
  if p.terms_version is distinct from public.current_terms_version() then
    raise exception 'Please accept the current Terms of Use to continue' using errcode = '42501';
  end if;
  return p;
end $$;

drop function if exists public.register_participant(text, text);
drop function if exists public.sign_in_participant(text);

create or replace function public.register_participant(p_name text, p_email text, p_age_confirmed boolean)
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
  if p_age_confirmed is not true then raise exception 'Please confirm you are 18 or older'; end if;

  -- One participant per browser session: release any other row this session held.
  update public.participants set auth_uid = null where auth_uid = v_uid and email <> v_email;

  select * into p from public.participants where email = v_email;
  if p.id is null then
    insert into public.participants (auth_uid, name, email, access, age_confirmed_at)
    values (v_uid, v_name, v_email,
            case when v_email ~ '@queensu\.ca$' then 'approved' else 'pending' end, now())
    returning * into p;
    insert into public.audit_log (actor, action, entity, detail)
    values (v_email, 'register', p.id::text, jsonb_build_object('name', v_name, 'access', p.access));
  else
    -- FR-002: a duplicate email resolves to the existing participant.
    update public.participants
    set auth_uid = v_uid, name = v_name, age_confirmed_at = coalesce(age_confirmed_at, now())
    where id = p.id returning * into p;
  end if;
  return p;
end $$;
