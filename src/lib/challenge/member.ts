import type { createAdminClient } from '@/lib/supabase/admin';
import { challengeWeek, checkinGoalFor, CHECKIN_GOALS, maltaToday, phoneKey, type CheckinGoal } from './checkin';

type Admin = ReturnType<typeof createAdminClient>;

// Server-only: works out which challenge member is checking in. Looks the
// email up in challenge_intakes, then challenge_member_goals (which may point
// at an intake matched earlier by phone), then — if a phone number was given
// — matches it against the intakes' phone numbers.
export type Member = {
  intakeId: string | null;
  crmContactId: string | null;
  /** the email the member is known by (the intake's when matched by phone) */
  email: string;
  fullName: string | null;
  phone: string | null;
  goal: CheckinGoal | null;
  startWeight: number | null;
  startDate: string | null;
  /** a challenge_member_goals row already exists for this email */
  hasSavedGoal: boolean;
};

const INTAKE_COLS = 'id, email, full_name, phone, main_goal, weight_kg, created_at, crm_contact_id';
type IntakeRow = { id: string; email: string; full_name: string; phone: string; main_goal: string; weight_kg: number; created_at: string; crm_contact_id: string | null };

export async function findMember(admin: Admin, rawEmail: string, rawPhone?: string | null): Promise<Member | null> {
  const email = rawEmail.trim().toLowerCase();
  const latest = (rows: IntakeRow[] | null) => rows?.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

  let intake = latest((await admin.from('challenge_intakes').select(INTAKE_COLS).ilike('email', email.replace(/[\\%_]/g, '\\$&'))).data);
  const { data: saved } = await admin.from('challenge_member_goals').select('*').eq('email', email).maybeSingle();
  if (!intake && saved?.intake_id) {
    intake = (await admin.from('challenge_intakes').select(INTAKE_COLS).eq('id', saved.intake_id).maybeSingle()).data;
  }
  const key = phoneKey(rawPhone);
  if (!intake && key) {
    const { data: all } = await admin.from('challenge_intakes').select(INTAKE_COLS);
    intake = latest((all ?? []).filter((r) => phoneKey(r.phone) === key));
  }
  if (!intake && !saved) return null;

  const savedGoal = saved && (CHECKIN_GOALS as readonly string[]).includes(saved.goal) ? (saved.goal as CheckinGoal) : null;
  return {
    intakeId: intake?.id ?? null,
    crmContactId: intake?.crm_contact_id ?? null,
    email: intake?.email ?? email,
    fullName: intake?.full_name ?? saved?.full_name ?? null,
    phone: intake?.phone ?? saved?.phone ?? (rawPhone?.trim() || null),
    goal: checkinGoalFor(intake?.main_goal) ?? savedGoal,
    startWeight: intake ? Number(intake.weight_kg) : saved?.start_weight_kg != null ? Number(saved.start_weight_kg) : null,
    startDate: intake ? maltaToday(new Date(intake.created_at)) : saved?.start_date ?? null,
    hasSavedGoal: !!saved,
  };
}

// For members with nothing on file yet: a name from the CRM, if they're in it.
export async function crmNameFor(admin: Admin, email: string, phone?: string | null): Promise<string | null> {
  const { data: byEmail } = await admin.from('crm_contacts').select('full_name').eq('email', email.trim().toLowerCase()).maybeSingle();
  if (byEmail?.full_name) return byEmail.full_name;
  const key = phoneKey(phone);
  if (!key) return null;
  const { data: withPhone } = await admin.from('crm_contacts').select('full_name, phone').not('phone', 'is', null);
  return (withPhone ?? []).find((c) => phoneKey(c.phone) === key)?.full_name ?? null;
}

export function weekFor(member: Pick<Member, 'startDate'> | null): number {
  return challengeWeek(member?.startDate ?? maltaToday());
}

export function firstName(fullName: string | null | undefined): string | null {
  return fullName?.trim().split(/\s+/)[0] || null;
}
