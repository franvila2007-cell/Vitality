-- Email the coach when a client books, moves or cancels a call (can be switched off).
alter table public.coach_settings add column booking_notify_enabled boolean not null default true;
