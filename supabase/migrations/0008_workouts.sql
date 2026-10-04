-- Workout Progress (Milestones): a client builds named workouts ("Push Day"),
-- adds exercises to them, and logs weight x reps per set. Everything else —
-- previous-session comparison, PRs, estimated 1RM, graphs — is derived from
-- these three tables on the client, so there is nothing to keep in sync.
--
-- Same security model as the food log: the client owns and writes their own
-- rows; the coach can read them (not edit).
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index workouts_user_idx on public.workouts (user_id);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index workout_exercises_workout_idx on public.workout_exercises (workout_id);
create index workout_exercises_user_idx on public.workout_exercises (user_id);

-- One row per set. `date` is the client-local calendar day (same convention as
-- food_log_entries.date), so a session is simply (exercise_id, date). weight_kg
-- may be 0 for bodyweight movements (the graph then falls back to reps).
create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  date date not null,
  set_number int not null check (set_number >= 1),
  weight_kg numeric(6,2) not null check (weight_kg >= 0 and weight_kg <= 1000),
  reps int not null check (reps >= 1 and reps <= 200),
  created_at timestamptz not null default now()
);

create index workout_sets_user_date_idx on public.workout_sets (user_id, date);
create index workout_sets_exercise_idx on public.workout_sets (exercise_id, date);

alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;

create policy "workouts_select" on public.workouts for select
  using (user_id = auth.uid() or public.is_coach());
create policy "workouts_write_own" on public.workouts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "workout_exercises_select" on public.workout_exercises for select
  using (user_id = auth.uid() or public.is_coach());
create policy "workout_exercises_write_own" on public.workout_exercises for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "workout_sets_select" on public.workout_sets for select
  using (user_id = auth.uid() or public.is_coach());
create policy "workout_sets_write_own" on public.workout_sets for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
