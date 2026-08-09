-- Vitality multi-client schema
-- Design notes: see /Users/francesco/.claude/plans/binary-painting-clover.md
--
-- Security model: every table has RLS enabled. A client can only touch rows
-- where user_id = auth.uid(). The coach (profiles.role = 'coach') gets broad
-- read access via is_coach(), and write access on the tables that represent
-- goals/targets (both coach and client are allowed to edit those, per the
-- confirmed product decision), plus setup tables (habits/meal_templates/
-- custom_foods) so the coach can provision a new client. Day-to-day tracking
-- data (food log, daily metrics, habit completions, chat state, IBF scores)
-- is client-write-only; the coach can see it but not edit it.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('coach','client')),
  full_name text not null default '',
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- security definer so policies elsewhere can call this without recursive RLS
create or replace function public.is_coach()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.profiles where id = auth.uid() and role = 'coach'
  );
$$;

create policy "profiles_select_self_or_coach"
  on public.profiles for select
  using (id = auth.uid() or public.is_coach());

create policy "profiles_insert_self"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_self_or_coach"
  on public.profiles for update
  using (id = auth.uid() or public.is_coach());

-- auto-provision a profile row whenever a Supabase Auth user is created.
-- role/full_name come from user metadata set at signUp()/admin invite time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'client'),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- generic updated_at bump helper, reused by several tables below
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- client_profiles — 1:1 with a client's profile
-- ─────────────────────────────────────────────────────────────────────────
create table public.client_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  start_date date not null default current_date,
  start_weight numeric not null default 0,
  current_weight numeric not null default 0,
  goal_weight numeric not null default 0,
  goal_type text not null default 'lose' check (goal_type in ('lose','gain')),
  goal_date date,
  program_length_days int not null default 60,
  -- monthly kg-change pace per goal_type, e.g. lose: 2kg/mo x3 then 1.5kg/mo x3
  pace_config jsonb not null default '{"lose":[2,2,2,1.5,1.5,1.5],"gain":[1.5,1.5,1.5,1.5,1.5,1.5]}',
  coach_note text not null default '',
  ibf_enabled boolean not null default false,
  ibf_baseline jsonb not null default '{}',
  ibf_main_baseline numeric not null default 0,
  updated_by text not null default 'coach' check (updated_by in ('coach','client')),
  updated_at timestamptz not null default now()
);

alter table public.client_profiles enable row level security;
create trigger client_profiles_set_updated_at before update on public.client_profiles
  for each row execute function public.set_updated_at();

create policy "client_profiles_select" on public.client_profiles for select
  using (user_id = auth.uid() or public.is_coach());
create policy "client_profiles_insert" on public.client_profiles for insert
  with check (user_id = auth.uid() or public.is_coach());
create policy "client_profiles_update" on public.client_profiles for update
  using (user_id = auth.uid() or public.is_coach());

-- ─────────────────────────────────────────────────────────────────────────
-- weight_checkpoints — monthly actual-weight entries (Month 2..N)
-- ─────────────────────────────────────────────────────────────────────────
create table public.weight_checkpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month_index int not null,
  weight numeric not null,
  entered_at timestamptz not null default now(),
  unique (user_id, month_index)
);

alter table public.weight_checkpoints enable row level security;

create policy "weight_checkpoints_select" on public.weight_checkpoints for select
  using (user_id = auth.uid() or public.is_coach());
create policy "weight_checkpoints_write" on public.weight_checkpoints for all
  using (user_id = auth.uid() or public.is_coach())
  with check (user_id = auth.uid() or public.is_coach());

-- ─────────────────────────────────────────────────────────────────────────
-- targets — daily macro/water/steps/sleep targets
-- ─────────────────────────────────────────────────────────────────────────
create table public.targets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  calories int not null default 2000,
  protein_g int not null default 150,
  carbs_g int not null default 200,
  fat_g int not null default 65,
  water_l numeric not null default 3,
  steps int not null default 8000,
  sleep_hours numeric not null default 8,
  updated_by text not null default 'coach' check (updated_by in ('coach','client')),
  updated_at timestamptz not null default now()
);

alter table public.targets enable row level security;
create trigger targets_set_updated_at before update on public.targets
  for each row execute function public.set_updated_at();

create policy "targets_select" on public.targets for select
  using (user_id = auth.uid() or public.is_coach());
create policy "targets_write" on public.targets for all
  using (user_id = auth.uid() or public.is_coach())
  with check (user_id = auth.uid() or public.is_coach());

-- ─────────────────────────────────────────────────────────────────────────
-- food_log_entries
-- `date` is the client's local calendar day, set explicitly by the app
-- (NOT derived from logged_at server-side, since that would use UTC and
-- misfile entries logged near midnight in the client's own timezone).
-- ─────────────────────────────────────────────────────────────────────────
create table public.food_log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  logged_at timestamptz not null default now(),
  name text not null,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  original_text text,
  matched_food text,
  amount numeric,
  unit text,
  estimated boolean not null default false,
  confidence numeric,
  source text not null default 'manual' check (source in ('chat','manual','template'))
);

create index food_log_entries_user_date_idx on public.food_log_entries (user_id, date);

alter table public.food_log_entries enable row level security;

create policy "food_log_select" on public.food_log_entries for select
  using (user_id = auth.uid() or public.is_coach());
create policy "food_log_write_own" on public.food_log_entries for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- daily_metrics — water / steps / sleep per day
-- ─────────────────────────────────────────────────────────────────────────
create table public.daily_metrics (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  water_l numeric not null default 0,
  steps int not null default 0,
  sleep_hours numeric not null default 0,
  primary key (user_id, date)
);

alter table public.daily_metrics enable row level security;

create policy "daily_metrics_select" on public.daily_metrics for select
  using (user_id = auth.uid() or public.is_coach());
create policy "daily_metrics_write_own" on public.daily_metrics for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- habits + habit_completions
-- ─────────────────────────────────────────────────────────────────────────
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,
  label text not null,
  tag text not null default '',
  sort_order int not null default 0,
  unique (user_id, key)
);

alter table public.habits enable row level security;

create policy "habits_select" on public.habits for select
  using (user_id = auth.uid() or public.is_coach());
create policy "habits_write" on public.habits for all
  using (user_id = auth.uid() or public.is_coach())
  with check (user_id = auth.uid() or public.is_coach());

create table public.habit_completions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  date date not null,
  completed boolean not null default true,
  primary key (user_id, habit_id, date)
);

alter table public.habit_completions enable row level security;

create policy "habit_completions_select" on public.habit_completions for select
  using (user_id = auth.uid() or public.is_coach());
create policy "habit_completions_write_own" on public.habit_completions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- meal_templates ("everyday meals") + custom_foods (coach-taught foods)
-- ─────────────────────────────────────────────────────────────────────────
create table public.meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  mealtime text check (mealtime in ('breakfast','lunch','dinner','snack'))
);

alter table public.meal_templates enable row level security;

create policy "meal_templates_select" on public.meal_templates for select
  using (user_id = auth.uid() or public.is_coach());
create policy "meal_templates_write" on public.meal_templates for all
  using (user_id = auth.uid() or public.is_coach())
  with check (user_id = auth.uid() or public.is_coach());

create table public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  default_grams numeric not null default 100,
  unique (user_id, name)
);

alter table public.custom_foods enable row level security;

create policy "custom_foods_select" on public.custom_foods for select
  using (user_id = auth.uid() or public.is_coach());
create policy "custom_foods_write" on public.custom_foods for all
  using (user_id = auth.uid() or public.is_coach())
  with check (user_id = auth.uid() or public.is_coach());

-- ─────────────────────────────────────────────────────────────────────────
-- foods_global — shared read-only reference food database (ported FOOD_DB)
-- ─────────────────────────────────────────────────────────────────────────
create table public.foods_global (
  name text primary key,
  type text not null check (type in ('per100g','perUnit','dish')),
  data jsonb not null
);

create table public.food_synonyms (
  phrase text primary key,
  canonical text not null references public.foods_global(name) on delete cascade
);

alter table public.foods_global enable row level security;
alter table public.food_synonyms enable row level security;

create policy "foods_global_select_all" on public.foods_global for select
  using (auth.uid() is not null);
create policy "food_synonyms_select_all" on public.food_synonyms for select
  using (auth.uid() is not null);
-- writes to the shared food DB are coach/admin-only (done via service role or coach UI)
create policy "foods_global_write_coach" on public.foods_global for all
  using (public.is_coach()) with check (public.is_coach());
create policy "food_synonyms_write_coach" on public.food_synonyms for all
  using (public.is_coach()) with check (public.is_coach());

-- ─────────────────────────────────────────────────────────────────────────
-- chat_pending_state — Vitto's "awaiting clarification" conversational state
-- ─────────────────────────────────────────────────────────────────────────
create table public.chat_pending_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pending_type text not null check (pending_type in ('unknown_food','mealtime_options')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.chat_pending_state enable row level security;

create policy "chat_pending_state_select" on public.chat_pending_state for select
  using (user_id = auth.uid() or public.is_coach());
create policy "chat_pending_state_write_own" on public.chat_pending_state for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- ibf_weekly_scores — weekly muscle-group self-assessment (optional module)
-- ─────────────────────────────────────────────────────────────────────────
create table public.ibf_weekly_scores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start_date date not null,
  muscle_group text not null,
  score numeric not null,
  primary key (user_id, week_start_date, muscle_group)
);

alter table public.ibf_weekly_scores enable row level security;

create policy "ibf_weekly_scores_select" on public.ibf_weekly_scores for select
  using (user_id = auth.uid() or public.is_coach());
create policy "ibf_weekly_scores_write_own" on public.ibf_weekly_scores for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- body_stats — measurements & lift baselines (captured, coach-visible only)
-- ─────────────────────────────────────────────────────────────────────────
create table public.body_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  waist numeric, chest numeric, hips numeric, arm numeric, thigh numeric,
  bench numeric, squat numeric, deadlift numeric, ohp numeric,
  updated_at timestamptz not null default now()
);

alter table public.body_stats enable row level security;
create trigger body_stats_set_updated_at before update on public.body_stats
  for each row execute function public.set_updated_at();

create policy "body_stats_select" on public.body_stats for select
  using (user_id = auth.uid() or public.is_coach());
create policy "body_stats_write" on public.body_stats for all
  using (user_id = auth.uid() or public.is_coach())
  with check (user_id = auth.uid() or public.is_coach());
