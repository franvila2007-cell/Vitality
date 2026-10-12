-- A message from the coach for one specific day, shown at the top of that
-- client's Today page (separate from the standing coach_note, which stays at
-- the bottom). One message per client per day; sending again replaces it.
create table public.coach_daily_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  body text not null check (char_length(btrim(body)) between 1 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.coach_daily_messages enable row level security;

-- Clients read their own; the coach reads and writes all.
create policy "coach_daily_messages_select" on public.coach_daily_messages for select
  using (user_id = auth.uid() or public.is_coach());
create policy "coach_daily_messages_insert" on public.coach_daily_messages for insert
  with check (public.is_coach());
create policy "coach_daily_messages_update" on public.coach_daily_messages for update
  using (public.is_coach()) with check (public.is_coach());
create policy "coach_daily_messages_delete" on public.coach_daily_messages for delete
  using (public.is_coach());
