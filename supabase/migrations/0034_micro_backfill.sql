-- Background filler for the quality score + micronutrients of logged foods.
-- Entries normally get them right after being logged, but if the client closes
-- the app first (or the AI answer was unusable) they stayed blank. Every 10
-- minutes the database calls /api/vitto/backfill, which rates the oldest blank
-- ones; micro_backfill_last_run_at throttles it so it can never run in a loop.
alter table public.coach_settings add column micro_backfill_last_run_at timestamptz;

create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule(
  'micro-backfill',
  '*/10 * * * *',
  $$select net.http_post(url := 'https://vitality-one-zeta.vercel.app/api/vitto/backfill', timeout_milliseconds := 10000)$$
);
