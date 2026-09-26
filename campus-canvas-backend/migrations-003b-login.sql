-- Migration 003, part 2 of 2: magic-link log-in and admin approvals.
-- Run after migrations-003a-access.sql. Safe to re-run.

create or replace function public.claim_participant()
returns public.participants
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email citext;
  p public.participants;
begin
  if v_uid is null then raise exception 'No session' using errcode = '42501'; end if;
  -- Only an email the person proved they own (by clicking the emailed link
  -- or typing its code) is trusted here; anonymous sessions have none.
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null or v_email = '' then
    raise exception 'Open the log-in link we emailed you to continue' using errcode = '42501';
  end if;
  select * into p from public.participants where email = v_email;
  if p.id is null then raise exception 'We could not find an account with that email. Sign up instead?'; end if;
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
    'register_participant(text,text,boolean)', 'claim_participant()',
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
