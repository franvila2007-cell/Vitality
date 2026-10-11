-- Fix: changing a contact's stage failed with "tuple to be updated was
-- already modified by an operation triggered by the current command".
-- The BEFORE UPDATE trigger inserted the timeline entry, whose AFTER INSERT
-- trigger (crm_touch_contact) then updated the very row still being
-- updated. Split it: the BEFORE trigger only stamps the row, and the
-- timeline entry is written AFTER the update has landed.

create or replace function public.crm_stamp_stage_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    new.last_activity_at := now();
  end if;
  return new;
end $$;

create or replace function public.crm_log_stage_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.crm_activities (contact_id, kind, body, meta)
    values (new.id, 'stage', '', jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;
  return null;
end $$;

drop trigger crm_contacts_stage_change on public.crm_contacts;

create trigger crm_contacts_stage_stamp before update on public.crm_contacts
  for each row execute function public.crm_stamp_stage_change();

create trigger crm_contacts_stage_log after update on public.crm_contacts
  for each row execute function public.crm_log_stage_change();
