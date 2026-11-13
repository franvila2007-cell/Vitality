-- Gamma credits per meal plan: the hourly routine reads them from Gamma's
-- generation result ("credits": {"deducted", "remaining"}) and saves them
-- with the plan, so the coach email can show what each plan cost.
alter table public.meal_plans
  add column if not exists gamma_credits_used integer,
  add column if not exists gamma_credits_left integer;

drop function if exists public.save_generated_meal_plan(uuid, text, text, jsonb);

create or replace function public.save_generated_meal_plan(
  plan_id uuid, url text, gamma_doc_id text, mismatches jsonb default '[]'::jsonb,
  credits_used integer default null, credits_left integer default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  req uuid;
begin
  update meal_plans set status = 'generated', gamma_url = url, gamma_id = gamma_doc_id, locked_until = null, last_error = null,
    issues = issues || coalesce(mismatches, '[]'::jsonb),
    gamma_credits_used = credits_used, gamma_credits_left = credits_left
  where id = plan_id
  returning request_id into req;
  if req is null then return 'plan not found'; end if;

  update meal_plan_requests set status = 'in_progress' where id = req and status = 'new';

  insert into crm_activities (contact_id, kind, body, meta)
  select c.id, 'system', 'Meal plan made in Gamma — ready for coach review', jsonb_build_object('gamma_url', url, 'meal_plan_id', plan_id)
  from crm_contacts c join meal_plan_requests r on lower(c.full_name) = lower(r.full_name) and c.brand = 'ironbodyfit'
  where r.id = req
  limit 1;
  return 'saved';
end $$;
revoke execute on function public.save_generated_meal_plan(uuid, text, text, jsonb, integer, integer) from public, anon, authenticated;
