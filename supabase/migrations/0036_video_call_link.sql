-- The coach's video call link (e.g. a reusable Google Meet room). Shown to clients in
-- booking/reminder emails and on their Calls screen, and written into the Google Calendar
-- event. Empty = no link.
alter table public.coach_settings add column if not exists video_link text not null default '';
comment on column public.coach_settings.video_link is 'https link to the coach''s reusable video room (Google Meet etc.); empty = none';
