import { addDays } from '@/lib/date';
import { CALL_MINUTES, maltaParts, maltaToUtc, weekStartOf, weekdayOf } from '@/lib/calls';

// Rules for clients booking their own calls. Pure functions (no database, no
// network) so they can be tested; the API routes feed them real data.

/** A client can't book something starting sooner than this. */
export const MIN_NOTICE_MS = 12 * 60 * 60 * 1000;
const STEP_MIN = 60;

export type BookingSettings = { enabled: boolean; openWeekday: number; openTime: string };
export type Avail = { weekday: number; start_time: string; end_time: string };
export type Interval = { start: number; end: number }; // epoch ms, end exclusive

export type BookableWeek = { monday: string; open: boolean; /** when a closed week opens */ opensAt: Date | null };

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * This week is always bookable (for the times still ahead). Next week opens on
 * the coach's chosen weekday/time (default Friday 12:00, Malta). Nothing
 * further ahead is offered, and nothing at all when booking is switched off.
 */
export function bookableWeeks(now: Date, s: BookingSettings): BookableWeek[] {
  const current = weekStartOf(maltaParts(now).date);
  const next = addDays(current, 7);
  const opensAt = maltaToUtc(addDays(current, s.openWeekday - 1), s.openTime.slice(0, 5));
  return [
    { monday: current, open: s.enabled, opensAt: null },
    { monday: next, open: s.enabled && now.getTime() >= opensAt.getTime(), opensAt },
  ];
}

/** Free start times ("HH:MM", Malta) per day of the week beginning `monday`. */
export function freeSlots(args: { monday: string; now: Date; availability: Avail[]; taken: Interval[]; busy: Interval[] }): Record<string, string[]> {
  const { monday, now, availability, taken, busy } = args;
  const out: Record<string, string[]> = {};
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const times = new Set<string>();
    for (const w of availability.filter((a) => a.weekday === weekdayOf(date))) {
      for (let t = toMin(w.start_time); t + CALL_MINUTES <= toMin(w.end_time); t += STEP_MIN) {
        const start = maltaToUtc(date, hhmm(t)).getTime();
        const end = start + CALL_MINUTES * 60000;
        if (start < now.getTime() + MIN_NOTICE_MS) continue;
        if (taken.some((x) => x.start < end && x.end > start)) continue;
        if (busy.some((x) => x.start < end && x.end > start)) continue;
        times.add(hhmm(t));
      }
    }
    out[date] = [...times].sort();
  }
  return out;
}
