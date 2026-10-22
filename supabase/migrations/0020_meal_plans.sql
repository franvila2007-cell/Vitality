-- Automated IronBody Fit meal plans (src/lib/mealPlan/pipeline.ts). One row
-- per build of a plan for a meal-plan request; a request can be rebuilt,
-- which adds a new version. The build runs one step per server call
-- (intake → recipes → repair → checks) and saves its progress in `state`,
-- so a timeout or crash resumes where it stopped instead of starting over.
--
-- Health answers and plan contents are coach-only, like meal_plan_requests
-- (0009): reads need is_coach(); every write happens server-side with the
-- service-role key, so there are no insert/update/delete policies.
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.meal_plan_requests(id) on delete cascade,
  version int not null default 1,
  status text not null default 'building'
    check (status in ('building', 'ready', 'needs_review', 'failed', 'generating', 'generated')),
  stage text not null default 'intake',
  -- Saved output of each finished step (intake, targets, recipes, ...).
  state jsonb not null default '{}',
  issues jsonb not null default '[]',
  gamma_title text,
  gamma_prompt text,
  gamma_id text,
  gamma_url text,
  attempts int not null default 0,
  last_error text,
  -- Lease so two calls never run the same step at once.
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, version)
);

create index meal_plans_status_idx on public.meal_plans (status, updated_at);

create trigger meal_plans_set_updated_at before update on public.meal_plans
  for each row execute function public.set_updated_at();

alter table public.meal_plans enable row level security;

create policy "meal_plans_select_coach" on public.meal_plans for select
  using (public.is_coach());
