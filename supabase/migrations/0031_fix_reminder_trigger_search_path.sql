-- Pin the search_path of the reminder-reset trigger function (Supabase security advisor).
alter function public.coach_calls_reset_reminders() set search_path = public;
