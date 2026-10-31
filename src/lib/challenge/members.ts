import type { createClient } from '@/lib/supabase/server';
import type { ChallengeCheckinRow } from '@/lib/supabase/database.types';
import { challengeWeek, checkinGoalFor, CHECKIN_GOALS, maltaToday, type CheckinGoal } from './checkin';
import { CHALLENGE_COHORT } from './questions';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Coach side of the weekly check-in: every challenge member (from intakes,
// plus members who only have a saved goal) with their check-ins attached.
// Runs with the coach's own session — RLS lets only the coach read these.

export type ChallengeMember = {
  /** the email the member is listed under (their intake's, if they have one) */
  email: string;
  name: string;
  phone: string | null;
  goal: CheckinGoal | null;
  intakeId: string | null;
  crmContactId: string | null;
  startDate: string;
  startWeight: number | null;
  /** their current week, from their own start date */
  week: number;
  checkins: ChallengeCheckinRow[];
  needsReview: boolean;
};

export async function loadChallengeMembers(supabase: ServerClient): Promise<{ members: ChallengeMember[]; error: string | null }> {
  const [intakes, goals, checkins] = await Promise.all([
    supabase.from('challenge_intakes').select('id, email, full_name, phone, main_goal, weight_kg, created_at, crm_contact_id').eq('cohort', CHALLENGE_COHORT),
    supabase.from('challenge_member_goals').select('*'),
    supabase.from('challenge_checkins').select('*').order('week_number').order('created_at'),
  ]);
  const error = intakes.error?.message ?? goals.error?.message ?? checkins.error?.message ?? null;

  const byEmail = new Map<string, ChallengeMember>();
  const byIntake = new Map<string, ChallengeMember>();
  for (const i of intakes.data ?? []) {
    const startDate = maltaToday(new Date(i.created_at));
    const m: ChallengeMember = {
      email: i.email.toLowerCase(), name: i.full_name, phone: i.phone, goal: checkinGoalFor(i.main_goal),
      intakeId: i.id, crmContactId: i.crm_contact_id, startDate, startWeight: Number(i.weight_kg),
      week: challengeWeek(startDate), checkins: [], needsReview: false,
    };
    byEmail.set(m.email, m);
    byIntake.set(i.id, m);
  }
  for (const g of goals.data ?? []) {
    // A saved goal pointing at an intake is just another email for that member.
    const linked = g.intake_id ? byIntake.get(g.intake_id) : undefined;
    if (linked) { byEmail.set(g.email, linked); continue; }
    if (byEmail.has(g.email)) continue;
    byEmail.set(g.email, {
      email: g.email, name: g.full_name || g.email, phone: g.phone,
      goal: (CHECKIN_GOALS as readonly string[]).includes(g.goal) ? (g.goal as CheckinGoal) : null,
      intakeId: null, crmContactId: null, startDate: g.start_date,
      startWeight: g.start_weight_kg != null ? Number(g.start_weight_kg) : null,
      week: challengeWeek(g.start_date), checkins: [], needsReview: true,
    });
  }
  for (const c of checkins.data ?? []) {
    const m = (c.intake_id && byIntake.get(c.intake_id)) || byEmail.get(c.email);
    if (!m) continue;
    m.checkins.push(c);
    if (c.needs_review) m.needsReview = true;
    if (!m.crmContactId && c.crm_contact_id) m.crmContactId = c.crm_contact_id;
  }
  const members = [...new Set(byEmail.values())].sort((a, b) => a.name.localeCompare(b.name));
  return { members, error };
}

export function checkedInThisWeek(m: ChallengeMember): ChallengeCheckinRow | undefined {
  return m.checkins.filter((c) => c.week_number === m.week).at(-1);
}

export function memberHref(m: Pick<ChallengeMember, 'email'>): string {
  return `/coach/challenge/member?email=${encodeURIComponent(m.email)}`;
}
