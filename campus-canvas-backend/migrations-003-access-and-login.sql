-- Migration 003: who can take part, and logging back in. Safe to re-run.
--
-- * @queensu.ca addresses are approved as soon as they register. Any other
--   address can still sign up, but waits for an admin to approve or reject it.
-- * Everyone registered before this migration stays approved.
-- * New sign-ups confirm they're 18 or older.
-- * sign_in_participant lets someone with an account log back in with their
--   email (the same trust level as registering again with that email).

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

create or replace function public.sign_in_participant(p_email text)
returns public.participants
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email citext := lower(btrim(p_email));
  p public.participants;
begin
  if v_uid is null then raise exception 'No session' using errcode = '42501'; end if;
  select * into p from public.participants where email = v_email;
  if p.id is null then raise exception 'We couldn’t find an account with that email. Sign up instead?'; end if;
  update public.participants set auth_uid = null where auth_uid = v_uid and id <> p.id;
  update public.participants set auth_uid = v_uid where id = p.id returning * into p;
  insert into public.audit_log (actor, action, entity, detail)
  values (v_email, 'sign_in', p.id::text, '{}'::jsonb);
  return p;
end $$;

create or replace function public.admin_set_participant_access(p_participant uuid, p_access text)
returns public.participants
language plpgsql security definer set search_path = public as $$
declare
  v_admin text := public.require_admin();
  p public.participants;
begin
  if p_access not in ('approved', 'pending', 'rejected') then raise exception 'Unknown access status'; end if;
  update public.participants set access = p_access where id = p_participant returning * into p;
  if p.id is null then raise exception 'Participant not found'; end if;
  insert into public.audit_log (actor, action, entity, detail)
  values (v_admin, 'participant_access', p.id::text, jsonb_build_object('access', p_access, 'email', p.email));
  return p;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'register_participant(text,text,boolean)', 'sign_in_participant(text)',
    'admin_set_participant_access(uuid,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- Refresh the API's view of the functions right away.
notify pgrst, 'reload schema';

-- Participants without a @queensu.ca address. They stay approved; reject any
-- you don't want from the admin console's Participants tab.
select name, email, access, registered_at
from public.participants
where email !~ '@queensu\.ca$' and not is_seed
order by registered_at;
