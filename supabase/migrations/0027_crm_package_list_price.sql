-- Discounts on a package: package_price stays what the client actually pays
-- (so revenue is unchanged and always net); package_list_price remembers the
-- price before the discount so the discount can be shown and edited later.
alter table public.crm_contacts add column package_list_price numeric(10, 2);
comment on column public.crm_contacts.package_list_price is 'Price before a discount was applied; package_price is what the client actually pays. Null = no discount.';
