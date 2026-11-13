-- The list of meal plans made, for the coach's boss: one row per person
-- (counted once, like the €10 charge), with their gym and the day their plan
-- was made. The hourly routine copies it into a shared Google Sheet.
alter table public.meal_plan_requests add column if not exists is_test boolean not null default false;

create or replace function public.list_meal_plan_register()
returns table (n bigint, full_name text, location text, made_on date, saved_copy text, gamma_url text)
language sql stable security definer set search_path = public as $$
  with made as (
    -- A plan made in Gamma by the automation…
    select r.id as request_id, r.full_name, r.answers->>'ibf_location' as loc, p.created_at as made_at, p.library_doc_url, p.gamma_url
    from meal_plan_requests r join meal_plans p on p.request_id = r.id
    where r.source = 'ironbodyfit' and not r.is_test and p.gamma_url is not null
    union all
    -- …or one made by hand and marked "Plan sent" in the app.
    select r.id, r.full_name, r.answers->>'ibf_location', r.created_at, null, null
    from meal_plan_requests r
    where r.source = 'ironbodyfit' and not r.is_test and r.status = 'sent'
      and not exists (select 1 from meal_plans p where p.request_id = r.id and p.gamma_url is not null)
  ),
  people as (
    select distinct on (lower(regexp_replace(trim(full_name), '\s+', ' ', 'g')))
      full_name, made_at, library_doc_url, gamma_url,
      (select m2.loc from made m2 where lower(regexp_replace(trim(m2.full_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(m.full_name), '\s+', ' ', 'g')) and m2.loc is not null limit 1) as loc
    from made m
    order by lower(regexp_replace(trim(full_name), '\s+', ' ', 'g')), made_at
  )
  select row_number() over (order by made_at), full_name,
    coalesce(replace(loc, 'IronBodyFit ', ''), 'Not asked'), (made_at at time zone 'Europe/Malta')::date,
    library_doc_url, gamma_url
  from people
  order by made_at;
$$;
revoke execute on function public.list_meal_plan_register() from public, anon, authenticated;
