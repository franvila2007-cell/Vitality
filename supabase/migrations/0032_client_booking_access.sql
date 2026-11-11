-- Who may book calls in the app. By default only 1-1 coaching clients (a CRM
-- package of 3 months / 6 months / 1 year); a row here is the coach's explicit
-- choice for one client and overrides that. Coach-only (RLS) so a client can
-- never switch it on for themselves; the server reads it with the service role.
create table public.client_booking_access (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  allowed boolean not null,
  updated_at timestamptz not null default now()
);
alter table public.client_booking_access enable row level security;
create policy "client_booking_access_coach_all" on public.client_booking_access for all
  using ((select public.is_coach())) with check ((select public.is_coach()));
