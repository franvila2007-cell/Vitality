// Pure workout-progress maths — no React, no Supabase — so the rules behind
// "am I getting stronger?" live in one place and can be tested directly
// (scripts/workouts-test.ts).
//
// A *session* is every set logged for one exercise on one calendar day. Each
// session is boiled down to its best working set, ranked by estimated 1RM
// (Epley: weight × (1 + reps / 30)), because "70kg × 8" and "75kg × 5" are
// only comparable once they're put on the same scale.

export type SetRow = { id: string; exercise_id: string; date: string; set_number: number; weight_kg: number; reps: number; created_at?: string };

export type Session = {
  date: string;
  sets: SetRow[];
  /** Best working set of the day (highest estimated 1RM, or most reps for bodyweight). */
  best: SetRow;
  /** Estimated 1RM of `best`; 0 for bodyweight (no load) sets. */
  e1rm: number;
  /** True when this session beat every earlier session of the exercise. */
  isPR: boolean;
};

export type Metric = 'strength' | 'weight' | 'reps';

export const WEIGHT_STEP = 2.5;

export function estimate1RM(weightKg: number, reps: number): number {
  if (!(weightKg > 0) || !(reps > 0)) return 0;
  return weightKg * (1 + reps / 30);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 72.5 → "72.5", 70 → "70" (no trailing .0). */
export function fmtKg(n: number): string {
  return String(round1(n));
}

export function fmtSet(s: { weight_kg: number; reps: number }): string {
  return s.weight_kg > 0 ? `${fmtKg(s.weight_kg)}kg × ${s.reps}` : `${s.reps} reps`;
}

function betterSet(a: SetRow, b: SetRow): SetRow {
  const ea = estimate1RM(a.weight_kg, a.reps), eb = estimate1RM(b.weight_kg, b.reps);
  if (ea !== eb) return ea > eb ? a : b;
  return a.reps >= b.reps ? a : b; // bodyweight (both 0): more reps wins
}

/** Metric value for a set, used both for ranking sessions and for the graph. */
export function metricValue(s: SetRow, metric: Metric): number {
  if (metric === 'weight') return s.weight_kg;
  if (metric === 'reps') return s.reps;
  return estimate1RM(s.weight_kg, s.reps);
}

/** Groups one exercise's sets into dated sessions (oldest → newest) and flags PRs. */
export function buildSessions(sets: SetRow[]): Session[] {
  const byDate = new Map<string, SetRow[]>();
  for (const s of sets) {
    const arr = byDate.get(s.date);
    if (arr) arr.push(s); else byDate.set(s.date, [s]);
  }
  const dates = [...byDate.keys()].sort();
  const sessions: Session[] = [];
  let bestSoFar = -1; // best e1RM (or reps for bodyweight) of earlier sessions
  for (const date of dates) {
    const daySets = byDate.get(date)!.slice().sort((a, b) => a.set_number - b.set_number || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    const best = daySets.reduce(betterSet);
    const e1rm = estimate1RM(best.weight_kg, best.reps);
    const score = e1rm > 0 ? e1rm : best.reps; // keeps bodyweight exercises PR-able on reps
    const isPR = bestSoFar >= 0 && score > bestSoFar + 1e-9;
    bestSoFar = Math.max(bestSoFar, score);
    sessions.push({ date, sets: daySets, best, e1rm, isPR });
  }
  return sessions;
}

/** True when the exercise has never been logged with a load — graph/% fall back to reps. */
export function isBodyweight(sessions: Session[]): boolean {
  return sessions.length > 0 && sessions.every((s) => s.e1rm === 0);
}

/** % change in strength between two sessions (e1RM, or reps for bodyweight). */
export function strengthChangePct(from: Session, to: Session): number | null {
  const a = from.e1rm > 0 ? from.e1rm : from.best.reps;
  const b = to.e1rm > 0 ? to.e1rm : to.best.reps;
  if (!(a > 0)) return null;
  return ((b - a) / a) * 100;
}

export type LiveComparison = {
  /** Short label, e.g. "+2.5kg", "+1 rep", "−2.5kg", or null when level. */
  delta: string | null;
  improved: boolean;
  /** Beats the all-time best (prior sessions only). */
  isPR: boolean;
};

/**
 * Compares the set being logged today against the previous session's best set
 * and the all-time best from earlier sessions — the instant "did I improve?"
 * answer while entering numbers. `earlier` must exclude today's session.
 */
export function compareToHistory(entry: { weight_kg: number; reps: number }, earlier: Session[]): LiveComparison | null {
  if (earlier.length === 0) return null;
  const last = earlier[earlier.length - 1].best;
  const e = estimate1RM(entry.weight_kg, entry.reps);
  const bodyweight = entry.weight_kg === 0 && last.weight_kg === 0;
  const score = bodyweight ? entry.reps : e;
  const allTime = Math.max(...earlier.map((s) => (bodyweight ? s.best.reps : s.e1rm)));
  const lastScore = bodyweight ? last.reps : estimate1RM(last.weight_kg, last.reps);
  const isPR = score > allTime + 1e-9;
  const improved = score > lastScore + 1e-9;

  let delta: string | null = null;
  const dw = round1(entry.weight_kg - last.weight_kg);
  const dr = entry.reps - last.reps;
  if (dw !== 0) delta = `${dw > 0 ? '+' : '−'}${fmtKg(Math.abs(dw))}kg`;
  else if (dr !== 0) delta = `${dr > 0 ? '+' : '−'}${Math.abs(dr)} rep${Math.abs(dr) === 1 ? '' : 's'}`;
  return { delta, improved, isPR };
}

export type MonthSummary = {
  workoutsCompleted: number;
  exercisesImproved: number;
  newPRs: number;
  /** Mean % strength change across exercises with enough data; null if none. */
  strengthTrendPct: number | null;
  /** How many exercises fed the trend. */
  trendSamples: number;
};

/**
 * Month overview. `monthStart` is "YYYY-MM-01" (client-local). Per exercise:
 *  - baseline  = last session before the month, else the month's first session
 *  - current   = the month's latest session
 * so a brand-new exercise only counts once it has two sessions in the month.
 * "Workouts completed" = distinct (workout, day) pairs with at least one set.
 */
export function summariseMonth(
  exercises: { id: string; workout_id: string }[],
  setsByExercise: Map<string, SetRow[]>,
  monthStart: string,
  monthEndExclusive: string,
): MonthSummary {
  const workoutDays = new Set<string>();
  let improved = 0, prs = 0;
  const changes: number[] = [];

  for (const ex of exercises) {
    const sessions = buildSessions(setsByExercise.get(ex.id) || []);
    const inMonth = sessions.filter((s) => s.date >= monthStart && s.date < monthEndExclusive);
    if (inMonth.length === 0) continue;
    for (const s of inMonth) {
      workoutDays.add(`${ex.workout_id}|${s.date}`);
      if (s.isPR) prs++;
    }
    const before = sessions.filter((s) => s.date < monthStart);
    const baseline = before.length > 0 ? before[before.length - 1] : inMonth[0];
    const current = inMonth[inMonth.length - 1];
    if (baseline === current) continue; // single data point — nothing to compare
    const pct = strengthChangePct(baseline, current);
    if (pct == null) continue;
    changes.push(pct);
    if (pct > 0) improved++;
  }

  return {
    workoutsCompleted: workoutDays.size,
    exercisesImproved: improved,
    newPRs: prs,
    strengthTrendPct: changes.length > 0 ? changes.reduce((a, b) => a + b, 0) / changes.length : null,
    trendSamples: changes.length,
  };
}

/** Starter workouts and the exercises people usually put in them — tap to add, no typing. */
export const WORKOUT_PRESETS: Record<string, string[]> = {
  'Push Day': ['Bench Press', 'Incline Dumbbell Press', 'Shoulder Press', 'Lateral Raise', 'Tricep Pushdown', 'Chest Fly'],
  'Pull Day': ['Lat Pulldown', 'Barbell Row', 'Seated Cable Row', 'Face Pull', 'Bicep Curl', 'Hammer Curl'],
  'Leg Day': ['Squat', 'Romanian Deadlift', 'Leg Press', 'Walking Lunges', 'Leg Curl', 'Calf Raise'],
  'Upper Body': ['Bench Press', 'Barbell Row', 'Shoulder Press', 'Lat Pulldown', 'Bicep Curl', 'Tricep Pushdown'],
  'Lower Body': ['Squat', 'Romanian Deadlift', 'Leg Press', 'Hip Thrust', 'Leg Extension', 'Calf Raise'],
};

export const GENERIC_EXERCISES = ['Squat', 'Deadlift', 'Bench Press', 'Overhead Press', 'Pull-up', 'Barbell Row'];
