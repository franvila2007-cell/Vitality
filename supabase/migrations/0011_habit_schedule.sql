-- Custom, scheduled habits. Clients can now add their own habits (e.g.
-- "5k run") on chosen weekdays or a single date, and a habit only counts
-- towards a day's rank on the days it's actually due (see src/lib/habits.ts).
--
--   days        weekdays it repeats on, 0 = Sunday … 6 = Saturday (JS
--               getDay()); null = every day
--   on_date     a one-off habit for just that date (days is then ignored)
--   starts_on   first day it counts — so adding a habit never rewrites the
--               rank of days before it existed
--   archived_on first day it no longer counts — removing a habit archives it
--               instead of deleting, so its past completions (and past
--               ranks) stay intact
--   added_by    who created it; clients only manage their own
--
-- Existing habits were all daily habits set by the coach: they get
-- days = null and starts_on far in the past, so every past rank is unchanged.
alter table public.habits
  add column emoji text not null default '',
  add column days smallint[] check (days is null or (cardinality(days) > 0 and days <@ array[0,1,2,3,4,5,6]::smallint[])),
  add column on_date date,
  add column starts_on date not null default '2000-01-01',
  add column archived_on date,
  add column added_by text not null default 'coach' check (added_by in ('coach', 'client'));

alter table public.habits alter column starts_on set default current_date;
