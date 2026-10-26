import type { Section } from '@/lib/assessment/questions';

// 8-Week Challenge weekly check-in (/challenge/check-in). Shared by the form,
// /api/challenge/check-in (re-validates against the same sections) and the
// coach pages. Temporary, like the intake.

export const CHECKIN_GOALS = ['Lose fat', 'Build muscle', 'More energy & routine'] as const;
export type CheckinGoal = (typeof CHECKIN_GOALS)[number];

export const PHOTO_BUCKET = 'challenge-checkins';
export const PHOTO_SLOTS = ['front', 'side', 'back'] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

// Week 1 of the challenge is the week of Monday 26 October 2026.
export const COHORT_START = '2026-10-26';

// Intake goal → check-in question set. "Both" (fat loss + muscle) gets the
// fat-loss questions; anything else gets energy & routine.
export function checkinGoalFor(intakeGoal: string | null | undefined): CheckinGoal | null {
  if (!intakeGoal) return null;
  if (intakeGoal === 'Lose fat' || intakeGoal === 'Both') return 'Lose fat';
  if (intakeGoal === 'Build muscle') return 'Build muscle';
  return 'More energy & routine';
}

const DAYS = ['0', '1', '2', '3', '4', '5', '6', '7'];

const THIS_WEEK: Section = {
  id: 'week',
  title: 'This week',
  questions: [
    { id: 'feeling', type: 'scale', label: 'Overall, how are you feeling?', required: true, scaleLabels: ['Rough', 'Amazing'] },
    { id: 'weight', type: 'number', label: 'Weight', unit: 'kg', min: 35, max: 300, step: 0.1, hint: 'Same scale, in the morning, before food.' },
    { id: 'waist', type: 'number', label: 'Waist', unit: 'cm', min: 40, max: 250, step: 0.5, hint: 'Around the belly button.' },
  ],
};

const GOAL_SECTIONS: Record<CheckinGoal, Section> = {
  'Lose fat': {
    id: 'goal',
    title: 'Your goal: lose fat',
    questions: [
      { id: 'hunger', type: 'scale', label: 'Hunger this week', required: true, scaleLabels: ['Not hungry', 'Starving'] },
      { id: 'cravings', type: 'scale', label: 'Cravings this week', required: true, scaleLabels: ['None', 'Constant'] },
      { id: 'plan_followed', type: 'number', label: 'How closely did you follow your plan?', required: true, unit: '%', min: 0, max: 100, step: 5, scaleLabels: ['Not at all', 'Perfectly'] },
      { id: 'training_sessions', type: 'choice', label: 'Training sessions this week', required: true, options: DAYS },
      { id: 'steps', type: 'number', label: 'Average daily steps', unit: 'steps', min: 0, max: 60000 },
    ],
  },
  'Build muscle': {
    id: 'goal',
    title: 'Your goal: build muscle',
    questions: [
      { id: 'appetite', type: 'scale', label: 'Appetite this week', required: true, scaleLabels: ['No appetite', 'Always hungry'] },
      { id: 'food_target_days', type: 'choice', label: 'Days you hit your food target', required: true, options: DAYS },
      { id: 'recovery', type: 'scale', label: 'Recovery this week', required: true, scaleLabels: ['Always sore', 'Fully recovered'] },
      { id: 'lift_exercise', type: 'text', label: 'Top lift this week', placeholder: 'e.g. Squat' },
      { id: 'lift_weight', type: 'number', label: 'Weight', unit: 'kg', min: 0, max: 500, step: 0.5, half: true },
      { id: 'lift_reps', type: 'number', label: 'Reps', unit: 'reps', min: 1, max: 100, half: true },
      { id: 'training_sessions', type: 'choice', label: 'Training sessions this week', required: true, options: DAYS },
    ],
  },
  'More energy & routine': {
    id: 'goal',
    title: 'Your goal: energy & routine',
    questions: [
      { id: 'sleep_hours', type: 'number', label: 'Average sleep per night', required: true, unit: 'hours', min: 2, max: 14, step: 0.5 },
      { id: 'energy', type: 'scale', label: 'Energy this week', required: true, scaleLabels: ['Drained', 'Full of energy'] },
      { id: 'habit_days', type: 'choice', label: 'Days you ticked your habits', required: true, options: DAYS },
      { id: 'steps', type: 'number', label: 'Average daily steps', unit: 'steps', min: 0, max: 60000 },
    ],
  },
};

const YOUR_WEEK: Section = {
  id: 'reflect',
  title: 'Your week',
  questions: [
    { id: 'biggest_win', type: 'textarea', label: 'Biggest win this week', required: true },
    { id: 'hardest', type: 'textarea', label: 'What was hardest?' },
    { id: 'need_from_us', type: 'textarea', label: 'What do you need from us this week?' },
  ],
};

export function checkinSections(goal: CheckinGoal): Section[] {
  return [THIS_WEEK, GOAL_SECTIONS[goal], YOUR_WEEK];
}

// Answers stored in their own columns rather than in `answers`.
export const COLUMN_ANSWERS = ['feeling', 'weight', 'waist', 'biggest_win', 'hardest', 'need_from_us'];

// Today's date in Malta, as YYYY-MM-DD.
export function maltaToday(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Malta' });
}

function mondayOf(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  return d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5;
}

// Rolling weeks: the week a member started is week 1 (never before the
// challenge's own week 1), and a new week begins every Monday. Clamped to 1–8.
export function challengeWeek(startDate: string, today = maltaToday()): number {
  const start = startDate < COHORT_START ? COHORT_START : startDate;
  const weeks = Math.floor((mondayOf(today) - mondayOf(start)) / (7 * 864e5)) + 1;
  return Math.min(8, Math.max(1, weeks));
}

// Last 8 digits, so "+356 7900 0000", "00356 79000000" and "79000000" match.
export function phoneKey(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-8) : '';
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
