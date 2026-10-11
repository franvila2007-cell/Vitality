-- CRM for the coach app: one contact per person (lead, IronBodyFit member,
-- client, past client), a timeline of everything that happened with them,
-- and follow-up tasks. Purely additive — no existing table changes.
--
-- Contacts are matched across funnels by (lowercased) email. Every public
-- form (/assessment, /ironbodyfit-meal-plans, /vitality-meal-plan, /join)
-- records itself on the matching contact server-side (src/lib/crm/ingest.ts),
-- and creating a client account marks the contact as won.

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text unique,               -- stored lowercased; null for phone-only leads
  phone text,
  source text not null default 'other',
  stage text not null default 'lead'
    check (stage in ('lead', 'contacted', 'consult', 'proposal', 'won', 'lost', 'past')),
  lost_reason text,
  tags text[] not null default '{}',
  value_eur numeric(10, 2),        -- expected / actual monthly value
  next_follow_up date,
  notes text not null default '',  -- pinned summary; the timeline holds the history
  client_id uuid references public.profiles(id) on delete set null,
  stage_changed_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index crm_contacts_stage_idx on public.crm_contacts (stage, last_activity_at desc);
create index crm_contacts_follow_up_idx on public.crm_contacts (next_follow_up) where next_follow_up is not null;
create index crm_contacts_client_idx on public.crm_contacts (client_id) where client_id is not null;

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  kind text not null check (kind in ('note', 'call', 'message', 'meeting', 'email', 'stage', 'form', 'system')),
  body text not null default '',
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index crm_activities_contact_idx on public.crm_activities (contact_id, created_at desc);
create index crm_activities_created_idx on public.crm_activities (created_at desc);

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  title text not null,
  due_on date not null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index crm_tasks_open_idx on public.crm_tasks (due_on) where done_at is null;

-- Coach-only, everything. Public form ingestion uses the service-role key.
alter table public.crm_contacts enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_tasks enable row level security;

create policy "crm_contacts_coach" on public.crm_contacts for all using (public.is_coach()) with check (public.is_coach());
create policy "crm_activities_coach" on public.crm_activities for all using (public.is_coach()) with check (public.is_coach());
create policy "crm_tasks_coach" on public.crm_tasks for all using (public.is_coach()) with check (public.is_coach());

-- Stage moves are logged on the timeline automatically, whoever made them.
create or replace function public.crm_log_stage_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    new.last_activity_at := now();
    insert into public.crm_activities (contact_id, kind, body, meta)
    values (new.id, 'stage', '', jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;
  return new;
end $$;

create trigger crm_contacts_stage_change before update on public.crm_contacts
  for each row execute function public.crm_log_stage_change();

-- Any new timeline entry bumps the contact's "last activity".
create or replace function public.crm_touch_contact() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.crm_contacts set last_activity_at = greatest(last_activity_at, new.created_at)
  where id = new.contact_id;
  return new;
end $$;

create trigger crm_activities_touch after insert on public.crm_activities
  for each row execute function public.crm_touch_contact();

-- ── Backfill from what already exists ────────────────────────────────────
-- Client accounts: active → won, archived → past client.
insert into public.crm_contacts (full_name, email, source, stage, client_id, created_at, stage_changed_at, last_activity_at)
select coalesce(nullif(p.full_name, ''), p.email), lower(p.email), 'existing_client',
       case when p.archived_at is null then 'won' else 'past' end,
       p.id, now(), now(), now()
from public.profiles p
where p.role = 'client' and p.email is not null
on conflict (email) do nothing;

-- Assessments → leads (or attached to the client they became).
insert into public.crm_contacts (full_name, email, phone, source, stage, created_at, last_activity_at)
select distinct on (lower(a.email)) a.full_name, lower(a.email), a.phone, 'assessment', 'lead', a.created_at, a.created_at
from public.assessments a
order by lower(a.email), a.created_at asc
on conflict (email) do update set phone = coalesce(public.crm_contacts.phone, excluded.phone);

insert into public.crm_activities (contact_id, kind, body, meta, created_at)
select c.id, 'form', 'Submitted the onboarding assessment', jsonb_build_object('form', 'assessment', 'submission_id', a.submission_id), a.created_at
from public.assessments a join public.crm_contacts c on c.email = lower(a.email);

-- Meal-plan requests → leads by source.
insert into public.crm_contacts (full_name, email, phone, source, stage, created_at, last_activity_at)
select distinct on (lower(m.email)) m.full_name, lower(m.email), m.phone,
       case m.source when 'ironbodyfit' then 'ironbodyfit' else 'v_plan' end, 'lead', m.created_at, m.created_at
from public.meal_plan_requests m
order by lower(m.email), m.created_at asc
on conflict (email) do update set phone = coalesce(public.crm_contacts.phone, excluded.phone);

insert into public.crm_activities (contact_id, kind, body, meta, created_at)
select c.id, 'form',
       case m.source when 'ironbodyfit' then 'Requested an IronBodyFit meal plan' else 'Requested a Vitality meal plan' end,
       jsonb_build_object('form', case m.source when 'ironbodyfit' then 'ironbodyfit' else 'v_plan' end, 'submission_id', m.submission_id),
       m.created_at
from public.meal_plan_requests m join public.crm_contacts c on c.email = lower(m.email);
