-- Every 5 minutes the database calls the app's meal-plan worker
-- (/api/meal-plans/worker), which emails the coach about plans that are
-- finished in Gamma or need attention, and restarts any build that stalled.
-- This runs inside Supabase, so it works independently of the hourly cloud
-- task that makes the Gamma documents (that task can't reach the app's URL).
-- The worker takes no input and returns only counts.
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'meal-plan-worker',
  '*/5 * * * *',
  $$select net.http_post(url := 'https://vitality-one-zeta.vercel.app/api/meal-plans/worker', timeout_milliseconds := 5000)$$
);
