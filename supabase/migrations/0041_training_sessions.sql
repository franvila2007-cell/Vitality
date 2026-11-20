-- Training tab: every session a client does, whatever the type — runs, walks,
-- rides, swims, classes, sport, yoga, a gym session, or anything custom.
-- Lifting details (sets/reps/kg) stay in workout_sets; this is the log.
create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('strength','run','walk','cycle','swim','hiit','class','sport','yoga','other')),
  title text,
  duration_min integer check (duration_min is null or duration_min between 1 and 1440),
  distance_km numeric(7,2) check (distance_km is null or distance_km > 0),
  effort smallint check (effort is null or effort between 1 and 10),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists training_sessions_user_date on public.training_sessions (user_id, date desc);
alter table public.training_sessions enable row level security;

create policy training_sessions_select_self_or_coach on public.training_sessions
  for select using (user_id = auth.uid() or public.is_coach());
create policy training_sessions_insert_self on public.training_sessions
  for insert with check (user_id = auth.uid());
create policy training_sessions_update_self on public.training_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy training_sessions_delete_self on public.training_sessions
  for delete using (user_id = auth.uid());
