import type { CheckinGoal } from './checkin';

// The check-in success screen's progress lines: this week compared with the
// member's start, read the way their goal reads it, and never negative or
// shaming. Pure, so it's easy to test; /api/challenge/check-in feeds it.

export type ProgressInput = {
  goal: CheckinGoal;
  /** intake weight, or the start weight they gave the check-in */
  startWeight: number | null;
  week: number;
  /** this check-in */
  weight: number | null;
  waist: number | null;
  /** waist from their earliest earlier check-in that had one */
  firstWaist: number | null;
  /** distinct weeks they've checked in for, this one included */
  weeksDone: number;
};

export type Progress = { lines: string[]; weeksDone: number };

const NEUTRAL = "Every week counts. We'll look at it together in your reply.";
const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

export function progressFor(p: ProgressInput): Progress {
  const lines: string[] = [];
  const weightChange = p.startWeight != null && p.weight != null ? p.weight - p.startWeight : null;
  const waistChange = p.firstWaist != null && p.waist != null ? p.waist - p.firstWaist : null;

  if (p.goal === 'Lose fat') {
    const down: string[] = [];
    if (weightChange != null && weightChange <= -0.1) down.push(`${fmt(-weightChange)} kg`);
    if (waistChange != null && waistChange <= -0.5) down.push(`${fmt(-waistChange)} cm`);
    if (down.length) lines.push(`Down ${down.join(' and ')} since you started 🔥`);
    else if (weightChange != null || waistChange != null) lines.push(NEUTRAL);
    // Faster than 1% of body weight a week (counting the run-up to week 1 as a week).
    if (weightChange != null && p.startWeight && -weightChange / Math.max(1, p.week) > p.startWeight * 0.01) {
      lines.push("That's quicker than planned, make sure you're eating enough. We'll check in with you.");
    }
  } else if (p.goal === 'Build muscle') {
    if (weightChange != null && weightChange >= 0.1) lines.push(`Up ${fmt(weightChange)} kg since you started, right on track 💪`);
    else if (weightChange != null) lines.push(NEUTRAL);
  }

  const done = Math.min(8, Math.max(1, p.weeksDone));
  lines.push(`You've done ${done} of 8 check-ins.`);
  return { lines, weeksDone: done };
}
