-- Free (complimentary) clients: someone the coach trains for free. They keep
-- every perk of their package (booking calls, Academy, the app...) but have no
-- price and no payments, and are left out of revenue everywhere.
alter table public.crm_contacts add column is_free boolean not null default false;
comment on column public.crm_contacts.is_free is 'Free (complimentary) client: keeps every perk of their package but no price, no payments and no revenue.';
