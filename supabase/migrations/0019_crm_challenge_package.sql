-- The Vitality 8-Week Challenge as a sellable package (early bird €197, full
-- price €247 — chosen when the package is recorded). Only widens the allowed
-- values of crm_contacts.package; no data is touched.
alter table public.crm_contacts drop constraint crm_contacts_package_check;
alter table public.crm_contacts
  add constraint crm_contacts_package_check check (package in ('3_months', '6_months', '12_months', 'meal_plan', '8_week_challenge'));
