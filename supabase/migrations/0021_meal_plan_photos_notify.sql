-- Recipe photos for automated meal plans: the photo chosen for each recipe
-- is copied here so the link in the Gamma never expires (stock-photo
-- search links are temporary). Public read — the photos are generic dish
-- stock photos, nothing about the client. Writes are server-side only
-- (service role), so no storage policies are needed.
insert into storage.buckets (id, name, public)
values ('meal-plan-photos', 'meal-plan-photos', true)
on conflict (id) do nothing;

-- When the coach was emailed about this plan (ready in Gamma, or needs
-- attention), so each plan is only emailed once.
alter table public.meal_plans add column notified_at timestamptz;
