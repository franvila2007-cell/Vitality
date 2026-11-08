-- Email reminders for booked calls: one the day before, one an hour before.
-- Each reminder is claimed exactly once in the database (so parallel runs can
-- never double-send), then sent by /api/booking/reminders, which the database
-- itself calls every 15 minutes (like the meal-plan worker).

alter table public.coach_calls
  add column reminded_day_at timestamptz,
  add column reminded_hour_at timestamptz;

-- Moving a call re-arms its reminders for the new time.
create or replace function public.coach_calls_reset_reminders()
returns trigger language plpgsql as $$
begin
  if new.starts_at is distinct from old.starts_at then
    new.reminded_day_at := null;
    new.reminded_hour_at := null;
  end if;
  return new;
end;
$$;
create trigger coach_calls_reset_reminders before update on public.coach_calls
  for each row execute function public.coach_calls_reset_reminders();

alter table public.coach_settings
  add column call_details text not null default '',              -- how the call happens (WhatsApp, Zoom link…), shown in reminder emails
  add column reminder_emails_enabled boolean not null default true,
  add column reminder_last_run_at timestamptz,
  add column reminder_last_error text;

-- Claims the reminders that are due. Reminders that would be pointless are
-- marked done without being returned: a call booked inside the last 24 h (or
-- 90 min) before it starts, or one whose window is nearly over.
create or replace function public.claim_due_reminders(p_now timestamptz default now(), p_max int default 12)
returns table (r_id uuid, r_client uuid, r_kind text, r_starts_at timestamptz, r_minutes int, r_which text)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coach_calls c set reminded_day_at = p_now
   where c.status = 'scheduled' and c.client_id is not null and c.reminded_day_at is null
     and c.starts_at > p_now and c.starts_at <= p_now + interval '24 hours'
     and (c.created_at > c.starts_at - interval '24 hours' or c.starts_at < p_now + interval '3 hours');

  update public.coach_calls c set reminded_hour_at = p_now
   where c.status = 'scheduled' and c.client_id is not null and c.reminded_hour_at is null
     and c.starts_at > p_now and c.starts_at <= p_now + interval '65 minutes'
     and c.created_at > c.starts_at - interval '90 minutes';

  return query
  with day as (
    update public.coach_calls c set reminded_day_at = p_now
     where c.id in (
       select x.id from public.coach_calls x
        where x.status = 'scheduled' and x.client_id is not null and x.reminded_day_at is null
          and x.starts_at > p_now and x.starts_at <= p_now + interval '24 hours'
        order by x.starts_at limit p_max for update skip locked)
    returning c.id, c.client_id, c.kind, c.starts_at, c.duration_min
  ), hour as (
    update public.coach_calls c set reminded_hour_at = p_now
     where c.id in (
       select x.id from public.coach_calls x
        where x.status = 'scheduled' and x.client_id is not null and x.reminded_hour_at is null
          and x.starts_at > p_now and x.starts_at <= p_now + interval '65 minutes'
        order by x.starts_at limit p_max for update skip locked)
    returning c.id, c.client_id, c.kind, c.starts_at, c.duration_min
  )
  select d.id, d.client_id, d.kind, d.starts_at, d.duration_min, 'day'::text from day d
  union all
  select h.id, h.client_id, h.kind, h.starts_at, h.duration_min, 'hour'::text from hour h;
end;
$$;

revoke all on function public.claim_due_reminders(timestamptz, int) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(timestamptz, int) to service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule(
  'call-reminders',
  '*/15 * * * *',
  $$select net.http_post(url := 'https://vitality-one-zeta.vercel.app/api/booking/reminders', timeout_milliseconds := 10000)$$
);
