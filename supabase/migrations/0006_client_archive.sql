-- Removing a client from the coach dashboard now archives them instead of
-- permanently deleting their account — the coach asked to always be able to
-- add a removed client back. Archived clients are hidden from the active
-- client list but every row (targets, food log, habits, progress) stays
-- intact, so restoring is just clearing this column.
alter table public.profiles add column archived_at timestamptz;
