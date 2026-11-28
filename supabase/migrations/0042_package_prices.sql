-- The coach's standard price for each package (e.g. {"6_months": 900}); any client can still be given a
-- custom price. Empty = fall back to the most common price used so far.
alter table public.coach_settings add column if not exists package_prices jsonb not null default '{}'::jsonb;
comment on column public.coach_settings.package_prices is 'standard price per package key, set by the coach; per-client custom prices are stored on crm_contacts';
