-- Booked calls are written straight into the coach's Google Calendar (via a
-- Google service account the coach shares their calendar with). Every 5
-- minutes the database calls /api/booking/google-sync, which creates, moves or
-- removes the Google event for any call that changed since it was last synced;
-- client bookings are also synced immediately.
alter table public.coach_calls add column google_synced_at timestamptz;

alter table public.coach_settings
  add column google_calendar_id text not null default '',  -- the calendar to write into, e.g. the coach's Gmail address
  add column google_sync_last_run_at timestamptz,
  add column google_sync_last_error text;

create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule(
  'google-sync',
  '*/5 * * * *',
  $$select net.http_post(url := 'https://vitality-one-zeta.vercel.app/api/booking/google-sync', timeout_milliseconds := 10000)$$
);
