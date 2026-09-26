-- Migration 003: only @queensu.ca email addresses can register. Safe to re-run.
-- Matches the check on the app's sign-up screen, so the rule holds even for
-- requests that don't come through the app.

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

-- Participants who registered before this rule with another kind of address.
-- They keep their data but can't sign in again with that address.
select name, email, registered_at
from public.participants
where email !~ '@queensu\.ca$' and not is_seed
order by registered_at;
