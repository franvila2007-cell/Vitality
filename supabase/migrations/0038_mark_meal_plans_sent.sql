-- The hourly routine reads the coach's sent Gmail and calls this with the
-- names on any meal-plan PDFs he emailed (e.g. "Corinne-Attard-Vitality-x-
-- IronBody-Fit-Meal-Plan.pdf" → 'Corinne Attard'). Each name is marked
-- "Plan sent" only when it matches exactly one IronBodyFit person (a PDF
-- name may drop a middle/second surname, so a name that starts the person's
-- full name also counts). Returns what happened to each name.
create or replace function public.mark_meal_plans_sent(names text[])
returns table (name text, result text)
language plpgsql security definer set search_path = public as $$
declare
  raw text;
  n text;
  people text[];
begin
  foreach raw in array coalesce(names, '{}') loop
    n := lower(regexp_replace(regexp_replace(trim(raw), '[-_]', ' ', 'g'), '\s+', ' ', 'g'));
    if n = '' then continue; end if;
    select array_agg(distinct k) into people from (
      select lower(regexp_replace(regexp_replace(trim(full_name), '[-_]', ' ', 'g'), '\s+', ' ', 'g')) as k
      from meal_plan_requests where source = 'ironbodyfit' and not is_test
    ) p where k = n or k like n || ' %';
    if people is null then
      name := raw; result := 'no match'; return next;
    elsif array_length(people, 1) > 1 then
      name := raw; result := 'more than one match — not marked'; return next;
    else
      update meal_plan_requests set status = 'sent'
      where source = 'ironbodyfit' and status <> 'sent'
        and lower(regexp_replace(regexp_replace(trim(full_name), '[-_]', ' ', 'g'), '\s+', ' ', 'g')) = people[1];
      name := raw; result := case when found then 'marked sent' else 'already sent' end; return next;
    end if;
  end loop;
end $$;
revoke execute on function public.mark_meal_plans_sent(text[]) from public, anon, authenticated;
