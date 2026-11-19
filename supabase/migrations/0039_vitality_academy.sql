-- Vitality Academy: the 24 course PDFs, shown to 1-1 coaching clients in the
-- Milestones tab. The PDFs live in a private bucket — the app checks access
-- and hands out short-lived signed links, so a forwarded link stops working.
insert into storage.buckets (id, name, public)
values ('academy', 'academy', false)
on conflict (id) do nothing;

-- Which courses each client has marked as done (the ticks in the app).
create table if not exists public.academy_progress (
  client_id uuid not null references auth.users(id) on delete cascade,
  course_number smallint not null check (course_number between 1 and 99),
  completed_at timestamptz not null default now(),
  primary key (client_id, course_number)
);
alter table public.academy_progress enable row level security;

create policy academy_progress_own_select on public.academy_progress
  for select using (client_id = auth.uid());
create policy academy_progress_own_insert on public.academy_progress
  for insert with check (client_id = auth.uid());
create policy academy_progress_own_delete on public.academy_progress
  for delete using (client_id = auth.uid());
