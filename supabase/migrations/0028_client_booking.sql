-- Client self-booking: clients pick their weekly check-in + info call from the
-- coach's free slots. Slots are computed server-side (availability, existing
-- calls and the coach's Google Calendar); this migration adds the settings and
-- the locked write that makes double-booking impossible.

alter table public.coach_calls
  add column booked_by text not null default 'coach' check (booked_by in ('coach', 'client'));

-- One row of coach settings. Coach-only (RLS); the Google links are secrets
-- and are only ever read server-side.
create table public.coach_settings (
  id int primary key default 1 check (id = 1),
  -- private "secret address in iCal format" links of the coach's Google calendars
  google_ical_urls text[] not null default '{}',
  -- next week opens for booking on this weekday (1 = Monday … 7 = Sunday) at this Malta time
  booking_open_weekday int not null default 5 check (booking_open_weekday between 1 and 7),
  booking_open_time time not null default '12:00',
  booking_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.coach_settings enable row level security;
create policy "coach_settings_coach_all" on public.coach_settings for all
  using ((select public.is_coach())) with check ((select public.is_coach()));
insert into public.coach_settings (id) values (1);

-- Books (or moves) one 1-hour call for a client. Only the server calls this
-- (service role), after checking the booking window and the coach's Google
-- calendar. The advisory lock serialises bookings so two clients can't take
-- the same slot; every rule that can be checked in the database is checked here too.
create or replace function public.client_book_call(p_client uuid, p_kind text, p_starts_at timestamptz, p_replace uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_end timestamptz := p_starts_at + interval '60 minutes';
  v_week_start timestamptz := date_trunc('week', p_starts_at at time zone 'Europe/Malta') at time zone 'Europe/Malta';
  v_week_end timestamptz := (date_trunc('week', p_starts_at at time zone 'Europe/Malta') + interval '7 days') at time zone 'Europe/Malta';
  v_dow int := extract(isodow from (p_starts_at at time zone 'Europe/Malta'))::int;
  v_time time := (p_starts_at at time zone 'Europe/Malta')::time;
  v_kind text := p_kind;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('coach_calls_booking'));

  if not exists (select 1 from public.profiles where id = p_client and role = 'client' and archived_at is null) then
    raise exception 'not_a_client';
  end if;
  if p_starts_at <= now() then raise exception 'in_the_past'; end if;

  if p_replace is not null then
    select id, kind into v_id, v_kind from public.coach_calls
      where id = p_replace and client_id = p_client and status = 'scheduled' and starts_at > now() for update;
    if v_id is null then raise exception 'not_found'; end if;
  elsif p_kind not in ('check_in', 'info') then
    raise exception 'bad_kind';
  end if;

  -- inside one of the coach's availability windows (and not wrapping past midnight)
  if not (v_time + interval '60 minutes' > v_time and exists (
    select 1 from public.coach_availability a
    where a.weekday = v_dow and a.start_time <= v_time and a.end_time >= v_time + interval '60 minutes'
  )) then
    raise exception 'outside_hours';
  end if;

  -- one call of each kind per week
  if exists (
    select 1 from public.coach_calls c
    where c.client_id = p_client and c.kind = v_kind and c.status in ('scheduled', 'done')
      and c.starts_at >= v_week_start and c.starts_at < v_week_end
      and (v_id is null or c.id <> v_id)
  ) then
    raise exception 'already_booked';
  end if;

  -- the slot is free
  if exists (
    select 1 from public.coach_calls c
    where c.status in ('scheduled', 'done') and (v_id is null or c.id <> v_id)
      and c.starts_at < v_end and c.starts_at + make_interval(mins => c.duration_min) > p_starts_at
  ) then
    raise exception 'slot_taken';
  end if;

  if v_id is not null then
    update public.coach_calls set starts_at = p_starts_at, updated_at = now() where id = v_id;
    return v_id;
  end if;
  insert into public.coach_calls (client_id, kind, starts_at, duration_min, status, booked_by)
    values (p_client, p_kind, p_starts_at, 60, 'scheduled', 'client') returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.client_book_call(uuid, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.client_book_call(uuid, text, timestamptz, uuid) to service_role;
