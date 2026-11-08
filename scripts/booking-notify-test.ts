// Checks the coach booking-alert email wording.  npx tsx scripts/booking-notify-test.ts
import { buildCoachBookingEmail } from '../src/lib/bookingNotify';
import { maltaToUtc } from '../src/lib/calls';
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const a = maltaToUtc('2026-11-10', '10:00').toISOString(), b = maltaToUtc('2026-11-12', '14:00').toISOString();
const booked = buildCoachBookingEmail({ event: 'booked', clientName: 'Maria Borg', kind: 'check_in', startsAt: a });
eq('booked subject', booked.subject, '📅 Maria Borg booked a check-in call — Tue 10 Nov 10:00');
eq('booked text', booked.text.includes('When: Tuesday 10 November at 10:00') && booked.text.includes('/coach/calendar'), true);
const moved = buildCoachBookingEmail({ event: 'moved', clientName: 'Maria Borg', kind: 'info', startsAt: b, previousStartsAt: a });
eq('moved subject', moved.subject, '🔁 Maria Borg moved their info call — now Thu 12 Nov 14:00');
eq('moved shows now and was', moved.text.includes('Now: Thursday 12 November at 14:00') && moved.text.includes('Was: Tuesday 10 November at 10:00'), true);
const cancelled = buildCoachBookingEmail({ event: 'cancelled', clientName: 'Maria Borg', kind: 'check_in', startsAt: a });
eq('cancelled subject', cancelled.subject, '❌ Maria Borg cancelled their check-in call (Tue 10 Nov 10:00)');
eq('cancelled mentions slot free', cancelled.text.includes('The slot is free again.'), true);
eq('name is escaped in html', buildCoachBookingEmail({ event: 'booked', clientName: '<b>X</b>', kind: 'info', startsAt: a }).html.includes('&lt;b&gt;X&lt;/b&gt;'), true);
eq('blank name falls back', buildCoachBookingEmail({ event: 'booked', clientName: '  ', kind: 'info', startsAt: a }).subject.startsWith('📅 A client booked'), true);
console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
