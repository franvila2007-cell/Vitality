-- Google Drive library of meal plans ("IronBodyFit Meal Plan Library"): the
-- app writes each plan as an HTML document (library_html, built in
-- src/lib/mealPlan/libraryDoc.ts) and the hourly Gamma cloud task uploads it
-- to the coach's Drive folder as a Google Doc, then records the Doc's link.
alter table public.meal_plans
  add column library_html text,
  add column library_doc_url text;

-- Plans in Gamma that aren't in the Drive library yet: the Doc's title and
-- its HTML with the Gamma link filled in.
create or replace function public.list_meal_plans_for_library(max_plans int default 10)
returns table (id uuid, title text, html text)
language sql security definer set search_path = public as $$
  select p.id,
    r.full_name
      || coalesce(' (' || nullif(replace(r.answers->>'ibf_location', 'IronBodyFit ', ''), '') || ')', '')
      || ' – IronBodyFit Meal Plan – ' || to_char(p.created_at at time zone 'Europe/Malta', 'FMDD Mon YYYY'),
    replace(p.library_html, '{{GAMMA_URL}}', p.gamma_url)
  from meal_plans p join meal_plan_requests r on r.id = p.request_id
  where p.status = 'generated' and p.gamma_url is not null and p.library_html is not null and p.library_doc_url is null
  order by p.created_at
  limit max_plans;
$$;

create or replace function public.save_library_doc(plan_id uuid, url text)
returns text
language sql security definer set search_path = public as $$
  update meal_plans set library_doc_url = url where id = plan_id returning 'saved';
$$;

revoke execute on function public.list_meal_plans_for_library(int) from public, anon, authenticated;
revoke execute on function public.save_library_doc(uuid, text) from public, anon, authenticated;
