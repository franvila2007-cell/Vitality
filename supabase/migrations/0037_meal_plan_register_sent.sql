-- The boss's list also shows whether each person's plan has been sent
-- (the request is marked "Plan sent" in the app).
drop function if exists public.list_meal_plan_register();

create or replace function public.list_meal_plan_register()
returns table (n bigint, full_name text, location text, made_on date, sent boolean, saved_copy text, gamma_url text)
language sql stable security definer set search_path = public as $$
  with made as (
    select r.id as request_id, r.full_name, r.answers->>'ibf_location' as loc, p.created_at as made_at, p.library_doc_url, p.gamma_url
    from meal_plan_requests r join meal_plans p on p.request_id = r.id
    where r.source = 'ironbodyfit' and not r.is_test and p.gamma_url is not null
    union all
    select r.id, r.full_name, r.answers->>'ibf_location', r.created_at, null, null
    from meal_plan_requests r
    where r.source = 'ironbodyfit' and not r.is_test and r.status = 'sent'
      and not exists (select 1 from meal_plans p where p.request_id = r.id and p.gamma_url is not null)
  ),
  people as (
    select distinct on (lower(regexp_replace(trim(full_name), '\s+', ' ', 'g')))
      lower(regexp_replace(trim(full_name), '\s+', ' ', 'g')) as k, full_name, made_at, library_doc_url, gamma_url,
      (select m2.loc from made m2 where lower(regexp_replace(trim(m2.full_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(m.full_name), '\s+', ' ', 'g')) and m2.loc is not null limit 1) as loc
    from made m
    order by lower(regexp_replace(trim(full_name), '\s+', ' ', 'g')), made_at
  )
  select row_number() over (order by made_at), full_name,
    coalesce(replace(loc, 'IronBodyFit ', ''), 'Not asked'), (made_at at time zone 'Europe/Malta')::date,
    exists (select 1 from meal_plan_requests r where r.source = 'ironbodyfit' and r.status = 'sent' and lower(regexp_replace(trim(r.full_name), '\s+', ' ', 'g')) = people.k),
    library_doc_url, gamma_url
  from people
  order by made_at;
$$;
revoke execute on function public.list_meal_plan_register() from public, anon, authenticated;
