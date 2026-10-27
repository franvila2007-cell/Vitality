-- The hourly Gamma cloud task (see src/lib/mealPlan) talks to the database
-- through the Supabase connector, which now stops to ask for confirmation
-- before raw UPDATE statements — and in the cloud nobody can answer, so the
-- save timed out. These functions do the same work behind a plain SELECT.
-- Only callable with the service role / postgres (not by app users): execute
-- is revoked from public, anon and authenticated.

-- Claim up to `max_plans` plans waiting for Gamma (or stuck mid-generation).
create or replace function public.claim_meal_plans_for_gamma(max_plans int default 5)
returns table (id uuid, request_id uuid, gamma_title text, gamma_prompt text)
language sql security definer set search_path = public as $$
  update meal_plans p set status = 'generating', locked_until = now() + interval '45 minutes'
  where p.id in (
    select m.id from meal_plans m
    where m.gamma_url is null and (m.status = 'ready' or (m.status = 'generating' and m.locked_until < now()))
    order by m.created_at limit max_plans
  )
  returning p.id, p.request_id, p.gamma_title, p.gamma_prompt;
$$;

-- Save a finished Gamma: link, any mismatches found when checking it, the
-- request moved to in progress, and a line on the client's CRM timeline.
-- The app's 5-minute worker then emails the coach.
create or replace function public.save_generated_meal_plan(plan_id uuid, url text, gamma_doc_id text, mismatches jsonb default '[]'::jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  req uuid;
begin
  update meal_plans set status = 'generated', gamma_url = url, gamma_id = gamma_doc_id, locked_until = null, last_error = null,
    issues = issues || coalesce(mismatches, '[]'::jsonb)
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

-- Give a plan back to the queue when generation failed; retried next hour.
create or replace function public.release_meal_plan(plan_id uuid, reason text)
returns text
language sql security definer set search_path = public as $$
  update meal_plans set status = 'ready', locked_until = null, last_error = left(reason, 500)
  where id = plan_id and gamma_url is null
  returning 'released';
$$;

revoke execute on function public.claim_meal_plans_for_gamma(int) from public, anon, authenticated;
revoke execute on function public.save_generated_meal_plan(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.release_meal_plan(uuid, text) from public, anon, authenticated;
