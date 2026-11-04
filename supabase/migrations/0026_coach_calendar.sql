-- Coach calendar: 1-hour calls booked by the coach (each client gets a weekly
-- check-in call and a weekly info call), the coach's weekly availability, and
-- the private token behind the Google-Calendar subscription feed.
-- Coach-only through RLS; clients can read their own calls.

create table public.coach_calls (
  id uuid primary key default gen_random_uuid(),
  -- who the call is with: an app client, or a CRM contact who isn't an app user
  -- (e.g. an 8-Week Challenge member). At least one is set.
  client_id uuid references public.profiles(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete cascade,
  kind text not null check (kind in ('check_in', 'info')),
  starts_at timestamptz not null,
  duration_min int not null default 60 check (duration_min between 15 and 240),
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled', 'no_show')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id is not null or contact_id is not null)
);

create index coach_calls_starts_idx on public.coach_calls (starts_at);
create index coach_calls_client_idx on public.coach_calls (client_id, starts_at desc) where client_id is not null;
create index coach_calls_contact_idx on public.coach_calls (contact_id, starts_at desc) where contact_id is not null;

alter table public.coach_calls enable row level security;
create policy "coach_calls_coach_all" on public.coach_calls for all
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "coach_calls_client_select_own" on public.coach_calls for select
  using (client_id = (select auth.uid()));

-- Weekly availability windows, Malta local time. weekday: 1 = Monday … 7 = Sunday.
create table public.coach_availability (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

alter table public.coach_availability enable row level security;
create policy "coach_availability_coach_all" on public.coach_availability for all
  using ((select public.is_coach())) with check ((select public.is_coach()));

-- A sensible starting point; the coach edits it from the calendar page.
insert into public.coach_availability (weekday, start_time, end_time)
select d, '09:00', '17:00' from generate_series(1, 5) as d;

-- One row: the secret in the calendar-feed URL (/api/calendar/<token>/vitality.ics).
-- Only the coach can read it; the feed route checks it server-side.
create table public.coach_calendar_feed (
  id int primary key default 1 check (id = 1),
  token text not null default encode(extensions.gen_random_bytes(24), 'hex')
);

alter table public.coach_calendar_feed enable row level security;
create policy "coach_calendar_feed_coach_all" on public.coach_calendar_feed for all
  using ((select public.is_coach())) with check ((select public.is_coach()));

insert into public.coach_calendar_feed (id) values (1);
