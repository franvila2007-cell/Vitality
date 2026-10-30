-- When the coach was warned that this plan has been waiting too long for its
-- Gamma (e.g. the Gamma connection to Claude expired and the hourly task
-- can't log in). One warning per plan; the normal "plan ready" email still
-- follows once the Gamma is made.
alter table public.meal_plans add column gamma_wait_alerted_at timestamptz;
