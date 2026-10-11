-- A stable list order for the CRM, so IronBodyFit meal-plan clients show in
-- the same order as the coach's Google Sheet. Every new contact takes the
-- next number, so form submissions land at the bottom — like adding a row.
-- (The sheet's own positions are written by the one-off import backfill.)
create sequence public.crm_contacts_list_position_seq;

alter table public.crm_contacts
  add column list_position bigint not null default nextval('public.crm_contacts_list_position_seq');

alter sequence public.crm_contacts_list_position_seq owned by public.crm_contacts.list_position;

create index crm_contacts_list_position_idx on public.crm_contacts (brand, list_position);
