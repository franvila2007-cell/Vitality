import { addDays } from '@/lib/date';
import type { Database } from '@/lib/supabase/database.types';

// Scheduled habits (see supabase/migrations/0011_habit_schedule.sql). A habit
// only counts towards a day's rank — and the daily streak — on the days it's
// actually due, so a "5k run" set for Mon/Wed/Sat never drags down a Tuesday.
// Every place that ranks a day goes through habitDay() below.

export type Habit = Database['public']['Tables']['habits']['Row'];
export type HabitSchedule = Pick<Habit, 'id' | 'days' | 'on_date' | 'starts_on' | 'archived_on'>;

// The columns every rank calculation needs — select this rather than '*'
// where only scheduling matters.
export const HABIT_SCHEDULE_COLUMNS = 'id, days, on_date, starts_on, archived_on';

// 0 = Sunday, matching JS getDay() and the habits.days column.
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Display order for weekday pickers: Monday first.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isHabitDue(h: HabitSchedule, date: string): boolean {
  if (date < h.starts_on) return false;
  if (h.archived_on && date >= h.archived_on) return false;
  if (h.on_date) return h.on_date === date;
  if (!h.days || h.days.length === 0) return true;
  return h.days.includes(weekday(date));
}

export function habitsDueOn<T extends HabitSchedule>(habits: T[], date: string): T[] {
  return habits.filter((h) => isHabitDue(h, date));
}

// Still shown in the client's habit list (not removed yet).
export function isHabitActive(h: HabitSchedule, today: string): boolean {
  return !h.archived_on || h.archived_on > today;
}

export function completionsByDate(rows: { habit_id: string; date: string }[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = out.get(r.date) ?? new Set<string>();
    set.add(r.habit_id);
    out.set(r.date, set);
  }
  return out;
}

// habitsTotal / habitsDone for computeDayRank(): only habits due that day,
// and only ticks on those habits (a tick on a habit that wasn't due doesn't
// inflate the count past the total).
export function habitDay(habits: HabitSchedule[], doneByDate: Map<string, Set<string>>, date: string): { total: number; done: number } {
  const due = habitsDueOn(habits, date);
  const doneIds = doneByDate.get(date);
  return { total: due.length, done: doneIds ? due.filter((h) => doneIds.has(h.id)).length : 0 };
}

// The daily streak: consecutive days, walking back from `from`, that have a
// logged meal and at least one habit ticked — where a day with no habits due
// at all passes the habit half on its own.
export function dailyStreak(
  from: string,
  mealDates: Set<string>,
  habits: HabitSchedule[],
  doneByDate: Map<string, Set<string>>,
  stepBack: (date: string) => string = (d) => addDays(d, -1),
): number {
  let streak = 0;
  let cursor = from;
  for (let i = 0; i < 400; i++) {
    if (!mealDates.has(cursor)) break;
    const { total, done } = habitDay(habits, doneByDate, cursor);
    if (total > 0 && done === 0) break;
    streak++;
    cursor = stepBack(cursor);
  }
  return streak;
}

export function scheduleLabel(h: Pick<Habit, 'days' | 'on_date'>): string {
  if (h.on_date) {
    const [y, m, d] = h.on_date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  if (!h.days || h.days.length === 0 || h.days.length === 7) return 'Every day';
  const set = new Set(h.days);
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Weekends';
  return WEEK_ORDER.filter((d) => set.has(d)).map((d) => WEEKDAYS[d]).join(', ');
}

// Quick picks for the "Add a habit" sheet.
export const HABIT_SUGGESTIONS: { emoji: string; label: string; days: number[] | null }[] = [
  { emoji: '🏃', label: '5k run', days: [1, 3, 6] },
  { emoji: '🏋️', label: 'Gym session', days: [1, 2, 4, 5] },
  { emoji: '👟', label: '10k steps', days: null },
  { emoji: '💧', label: 'Drink 3L of water', days: null },
  { emoji: '🧘', label: 'Stretch for 10 min', days: null },
  { emoji: '😴', label: 'In bed by 11pm', days: null },
  { emoji: '🥗', label: 'Meal prep', days: [0] },
  { emoji: '🚫', label: 'No alcohol', days: null },
];

export const HABIT_EMOJIS = ['🏃', '🏋️', '👟', '🚴', '🏊', '🧘', '💧', '🥗', '🍎', '😴', '📖', '🚫', '💊', '☀️', '⚡', '✅'];
