-- Streak badges a client has unlocked (Vital days in a row). The app inserts
-- one when the client's streak first reaches the badge; they stay earned.
create table if not exists public.vitality_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge text not null check (badge in ('streak_3','streak_7','streak_14','streak_30','streak_60')),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge)
);
alter table public.vitality_badges enable row level security;

create policy vitality_badges_select_self_or_coach on public.vitality_badges
  for select using (user_id = auth.uid() or public.is_coach());
create policy vitality_badges_insert_self on public.vitality_badges
  for insert with check (user_id = auth.uid());
