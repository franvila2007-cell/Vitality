// Checks the client-booking rules.  npx tsx scripts/booking-test.ts
import { bookableWeeks, freeSlots, MIN_NOTICE_MS } from '../src/lib/booking';
import { maltaToUtc } from '../src/lib/calls';
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const S = { enabled: true, openWeekday: 5, openTime: '12:00:00' };
const at = (d: string, t: string) => maltaToUtc(d, t);
// Wed 11 Nov 2026
eq('midweek: this week open, next week closed', bookableWeeks(at('2026-11-11', '10:00'), S).map((w) => w.open), [true, false]);
eq('opens Friday noon (Malta)', bookableWeeks(at('2026-11-13', '12:00'), S)[1].open, true);
eq('just before Friday noon: still closed', bookableWeeks(at('2026-11-13', '11:59'), S)[1].open, false);
eq('weekend: next week open', bookableWeeks(at('2026-11-15', '20:00'), S)[1].open, true);
eq('Monday: the old "next" week is now current, new next closed', bookableWeeks(at('2026-11-16', '09:00'), S).map((w) => [w.monday, w.open]), [['2026-11-16', true], ['2026-11-23', false]]);
eq('weeks', bookableWeeks(at('2026-11-11', '10:00'), S).map((w) => w.monday), ['2026-11-09', '2026-11-16']);
eq('booking switched off closes everything', bookableWeeks(at('2026-11-14', '10:00'), { ...S, enabled: false }).map((w) => w.open), [false, false]);
eq('opens-at is Fri 13 Nov 12:00 Malta', bookableWeeks(at('2026-11-11', '10:00'), S)[1].opensAt?.toISOString(), '2026-11-13T11:00:00.000Z');

const avail = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_time: '09:00:00', end_time: '17:00:00' }));
const now = at('2026-11-11', '08:00'); // Wed
const next = freeSlots({ monday: '2026-11-16', now, availability: avail, taken: [], busy: [] });
eq('Mon 16 Nov 09:00–16:00 hourly', next['2026-11-16'], ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
eq('weekend has none', next['2026-11-21'], []);
const taken = [{ start: at('2026-11-16', '10:00').getTime(), end: at('2026-11-16', '11:00').getTime() }];
eq('a booked call removes its hour', freeSlots({ monday: '2026-11-16', now, availability: avail, taken, busy: [] })['2026-11-16'].includes('10:00'), false);
const half = [{ start: at('2026-11-16', '12:30').getTime(), end: at('2026-11-16', '13:15').getTime() }];
const h = freeSlots({ monday: '2026-11-16', now, availability: avail, taken: [], busy: half })['2026-11-16'];
eq('a half-hour Google event blocks both hours it touches', [h.includes('12:00'), h.includes('13:00'), h.includes('11:00'), h.includes('14:00')], [false, false, true, true]);
const allDay = [{ start: at('2026-11-17', '00:00').getTime(), end: at('2026-11-18', '00:00').getTime() }];
eq('an all-day event blocks the day', freeSlots({ monday: '2026-11-16', now, availability: avail, taken: [], busy: allDay })['2026-11-17'], []);
const soon = freeSlots({ monday: '2026-11-09', now: at('2026-11-11', '10:00'), availability: avail, taken: [], busy: [] })['2026-11-11'];
eq('minimum notice: nothing before 22:00 today → none left on Wed', soon, []);
const todayLate = freeSlots({ monday: '2026-11-09', now: at('2026-11-11', '03:00'), availability: avail, taken: [], busy: [] })['2026-11-11'];
eq('12h notice at 03:00 → from 15:00', todayLate, ['15:00', '16:00']);
const split = freeSlots({ monday: '2026-11-16', now, availability: [{ weekday: 1, start_time: '09:00:00', end_time: '11:00:00' }, { weekday: 1, start_time: '18:00:00', end_time: '20:00:00' }], taken: [], busy: [] })['2026-11-16'];
eq('two windows in a day', split, ['09:00', '10:00', '18:00', '19:00']);
eq('notice constant is 12h', MIN_NOTICE_MS, 43200000);
console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
