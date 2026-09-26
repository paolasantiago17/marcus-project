-- Migration 004: email app feedback to the ArtUP inbox. Safe to re-run.
--
-- Every new feedback row is also posted to the website's contact form
-- endpoint, so it lands in info@artup.life just like a Contact page message:
-- the subject reads "[Contact] Campus Canvas feedback: <category>" and a
-- reply goes straight to the student. The website already holds the email
-- settings (Resend), so there is nothing else to set up.
--
-- pg_net sends the post once the feedback is saved, and a failure can never
-- stop the feedback from saving; it stays in the console's Feedback tab
-- either way. To see how the latest posts went (pg_net keeps them 6 hours):
--   select status_code, content, error_msg, created
--   from net._http_response order by created desc limit 10;

create extension if not exists pg_net with schema extensions;

create or replace function public.email_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.participants;
begin
  select * into p from public.participants where id = new.participant_id;
  -- The Contact page form's fields (api/contact.js in the website repo).
  perform net.http_post(
    url := 'https://artup.life/api/contact',
    body := jsonb_build_object(
      'name', p.name, 'email', p.email::text,
      'subject', 'Campus Canvas feedback: ' || new.category,
      'message', new.message),
    timeout_milliseconds := 10000);
  return new;
exception when others then
  raise warning 'Feedback % was saved but not emailed: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists email_feedback on public.feedback;
create trigger email_feedback after insert on public.feedback
  for each row execute function public.email_feedback();
