-- CRM: which business a contact belongs to, and the package a client joined.
--
--   brand          'vitality' or 'ironbodyfit' — colour-codes and orders the
--                  CRM (Vitality first). Set from the funnel they came in by.
--   package        '6_months' or '12_months' — every converted client joins
--                  one of the two.
--   package_price  total € paid for the package
--   package_start  first day of the package; the end date is derived
--                  (start + 6 / 12 months), so renewals can be flagged.
alter table public.crm_contacts
  add column brand text not null default 'vitality' check (brand in ('vitality', 'ironbodyfit')),
  add column package text check (package in ('6_months', '12_months')),
  add column package_price numeric(10, 2),
  add column package_start date;

update public.crm_contacts set brand = 'ironbodyfit' where source = 'ironbodyfit';

-- Clients imported as "existing client" who actually came in through the
-- onboarding assessment get that as their source.
update public.crm_contacts c set source = 'assessment'
where c.source = 'existing_client'
  and exists (select 1 from public.crm_activities a where a.contact_id = c.id and a.kind = 'form' and a.meta->>'form' = 'assessment');

create index crm_contacts_package_start_idx on public.crm_contacts (package_start) where package_start is not null;
