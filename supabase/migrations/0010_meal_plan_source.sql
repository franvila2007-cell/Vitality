-- Meal-plan requests now come from two public forms: the IronBodyFit one
-- (/ironbodyfit-meal-plans) and V Plans for Vitality's own clients
-- (/v-plan). Same table, told apart by source — existing rows all came
-- from the IronBodyFit form, which the default backfills.
alter table public.meal_plan_requests
  add column source text not null default 'ironbodyfit'
  check (source in ('ironbodyfit', 'vitality'));

create index meal_plan_requests_source_created_at_idx
  on public.meal_plan_requests (source, created_at desc);
