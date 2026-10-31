import type { Answers } from '@/lib/assessment/questions';
import type { ChallengeCheckinRow } from '@/lib/supabase/database.types';
import { checkinSections, CHECKIN_GOALS, type CheckinGoal } from './checkin';

// A saved check-in as labelled answers, in question order — for the coach's
// member page and the "Draft reply" prompt.
export function describeCheckin(row: ChallengeCheckinRow): { section: string; items: [string, string][] }[] {
  const goal: CheckinGoal = (CHECKIN_GOALS as readonly string[]).includes(row.goal ?? '') ? (row.goal as CheckinGoal) : 'More energy & routine';
  const answers: Answers = {
    ...((row.answers ?? {}) as Answers),
    ...(row.feeling != null ? { feeling: String(row.feeling) } : {}),
    ...(row.weight_kg != null ? { weight: String(row.weight_kg) } : {}),
    ...(row.waist_cm != null ? { waist: String(row.waist_cm) } : {}),
    biggest_win: row.biggest_win,
    ...(row.hardest ? { hardest: row.hardest } : {}),
    ...(row.need_from_us ? { need_from_us: row.need_from_us } : {}),
  };
  return checkinSections(goal).map((s) => ({
    section: s.title,
    items: s.questions.flatMap((q): [string, string][] => {
      const v = answers[q.id];
      if (v === undefined || v === '') return [];
      const text = Array.isArray(v) ? v.join(', ') : v;
      const suffix = q.type === 'scale' ? '/10' : q.unit === '%' ? '%' : q.unit ? ` ${q.unit}` : '';
      return [[q.label, `${text}${suffix}`]];
    }),
  })).filter((s) => s.items.length);
}
