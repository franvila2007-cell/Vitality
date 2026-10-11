-- CRM money: more package types, how a client pays, and every payment.
--
--   package        1-1 coaching for 3 months (offer), 6 months or 1 year, or
--                  a one-off meal plan (Vitality or IronBodyFit, by brand)
--   payment_plan   'full' (paid upfront) or 'monthly' (instalments)
--   payment_method how they pay — cash, card, bank transfer, Revolut, other
--
-- crm_payments is the ledger behind "cash collected": one row per payment,
-- expected (due_on) and, once received, paid (paid_on). Paid in full is one
-- row; monthly is one row per month. Revenue = packages sold (their price),
-- cash collected = payments actually received.

alter table public.crm_contacts drop constraint crm_contacts_package_check;
alter table public.crm_contacts
  add constraint crm_contacts_package_check check (package in ('3_months', '6_months', '12_months', 'meal_plan')),
  add column payment_plan text check (payment_plan in ('full', 'monthly')),
  add column payment_method text;

create table public.crm_payments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  amount numeric(10, 2) not null check (amount >= 0),
  due_on date not null,
  paid_on date,
  method text,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index crm_payments_contact_idx on public.crm_payments (contact_id, due_on);
create index crm_payments_paid_idx on public.crm_payments (paid_on) where paid_on is not null;
create index crm_payments_open_idx on public.crm_payments (due_on) where paid_on is null;

alter table public.crm_payments enable row level security;
create policy "crm_payments_coach" on public.crm_payments for all using (public.is_coach()) with check (public.is_coach());
