-- Daily rank: gold/silver/bronze per client per day, computed from habit
-- completion %, macro-target adherence %, and food quality (rated by
-- Vitto's LLM at log time — see quality_score below). The rank itself is
-- computed on the fly from existing data (food_log_entries,
-- habit_completions, targets) rather than stored, since storing it risks
-- going stale whenever a client edits a meal or habit after the day was
-- scored. Only the coach's manual override is persisted here.

alter table public.food_log_entries
  add column quality_score smallint check (quality_score between 0 and 100);

create table public.rank_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  rank text not null check (rank in ('gold', 'silver', 'bronze')),
  set_by uuid not null references auth.users(id),
  set_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.rank_overrides enable row level security;

create policy "rank_overrides_select_self_or_coach"
  on public.rank_overrides for select
  using (user_id = auth.uid() or public.is_coach());

-- Ranking is coach-confirmed, not self-assigned — a client can see their
-- own override but only the coach can set or change one.
create policy "rank_overrides_insert_coach_only"
  on public.rank_overrides for insert
  with check (public.is_coach());

create policy "rank_overrides_update_coach_only"
  on public.rank_overrides for update
  using (public.is_coach());

create policy "rank_overrides_delete_coach_only"
  on public.rank_overrides for delete
  using (public.is_coach());
