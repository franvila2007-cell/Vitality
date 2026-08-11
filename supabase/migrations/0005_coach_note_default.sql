-- client_profiles.coach_note already existed (unused until now) — this just
-- gives it a real default message and backfills any client that still has
-- the empty-string default from before this feature existed. Editable per
-- client from the coach dashboard.
alter table public.client_profiles
  alter column coach_note set default 'Never stop moving forward — every day is a big day. Let''s strive for gold. Trust Vitality and let''s reach our goal!';

update public.client_profiles set coach_note = 'Never stop moving forward — every day is a big day. Let''s strive for gold. Trust Vitality and let''s reach our goal!' where coach_note = '';
