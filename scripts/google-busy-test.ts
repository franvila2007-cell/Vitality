// Checks the Google-calendar busy reader against a synthetic Google-style feed.  npx tsx scripts/google-busy-test.ts
import { busyFromIcs, normalizeIcalUrl, overlapsAny } from '../src/lib/googleBusy';
import { maltaToUtc } from '../src/lib/calls';
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VTIMEZONE
TZID:Europe/Malta
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:single@x
DTSTART;TZID=Europe/Malta:20261110T100000
DTEND;TZID=Europe/Malta:20261110T110000
SUMMARY:Dentist
END:VEVENT
BEGIN:VEVENT
UID:weekly@x
DTSTART;TZID=Europe/Malta:20261026T180000
DTEND;TZID=Europe/Malta:20261026T190000
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=Europe/Malta:20261116T180000
SUMMARY:Gym
END:VEVENT
BEGIN:VEVENT
UID:weekly@x
RECURRENCE-ID;TZID=Europe/Malta:20261109T180000
DTSTART;TZID=Europe/Malta:20261109T200000
DTEND;TZID=Europe/Malta:20261109T210000
SUMMARY:Gym (moved)
END:VEVENT
BEGIN:VEVENT
UID:allday@x
DTSTART;VALUE=DATE:20261112
DTEND;VALUE=DATE:20261113
SUMMARY:Holiday
END:VEVENT
BEGIN:VEVENT
UID:free@x
DTSTART;TZID=Europe/Malta:20261111T090000
DTEND;TZID=Europe/Malta:20261111T100000
TRANSP:TRANSPARENT
SUMMARY:FYI only
END:VEVENT
BEGIN:VEVENT
UID:cancelled@x
DTSTART;TZID=Europe/Malta:20261111T120000
DTEND;TZID=Europe/Malta:20261111T130000
STATUS:CANCELLED
SUMMARY:Cancelled
END:VEVENT
BEGIN:VEVENT
UID:utc@x
DTSTART:20261113T130000Z
DTEND:20261113T140000Z
SUMMARY:Call in UTC
END:VEVENT
END:VCALENDAR`.replace(/\n/g, '\r\n');
const from = maltaToUtc('2026-11-09', '00:00'), to = maltaToUtc('2026-11-16', '00:00');
const r = busyFromIcs(ics, from, to);
const at = (d: string, t: string) => maltaToUtc(d, t).getTime();
const blocked = (d: string, t: string) => overlapsAny(r.busy, at(d, t), at(d, t) + 3600000);
eq('single event blocks 10:00 on 10 Nov', blocked('2026-11-10', '10:00'), true);
eq('…and not 11:00', blocked('2026-11-10', '11:00'), false);
eq('weekly gym moved to 20:00 on 9 Nov', blocked('2026-11-09', '20:00'), true);
eq('…and the original 18:00 is free that Monday', blocked('2026-11-09', '18:00'), false);
eq('all-day holiday blocks 12 Nov morning', blocked('2026-11-12', '09:00'), true);
eq('…and the evening', blocked('2026-11-12', '20:00'), true);
eq('…but not 11 Nov or 13 Nov morning', blocked('2026-11-11', '20:00') || blocked('2026-11-13', '09:00'), false);
eq('transparent (free) event does not block', blocked('2026-11-11', '09:00'), false);
eq('cancelled event does not block', blocked('2026-11-11', '12:00'), false);
eq('UTC event 14:00 Malta on 13 Nov', blocked('2026-11-13', '14:00'), true);
const next = busyFromIcs(ics, maltaToUtc('2026-11-16', '00:00'), maltaToUtc('2026-11-23', '00:00'));
eq('EXDATE week 16 Nov: gym removed', overlapsAny(next.busy, at('2026-11-16', '18:00'), at('2026-11-16', '19:00')), false);
eq('gym back on 23 Nov', overlapsAny(busyFromIcs(ics, maltaToUtc('2026-11-23', '00:00'), maltaToUtc('2026-11-30', '00:00')).busy, at('2026-11-23', '18:00'), at('2026-11-23', '19:00')), true);
eq('allDay counted', r.allDay, 1);
eq('google url ok', normalizeIcalUrl('webcal://calendar.google.com/calendar/ical/abc%40gmail.com/private-xyz/basic.ics')?.startsWith('https://calendar.google.com/calendar/ical/'), true);
eq('other hosts refused', normalizeIcalUrl('https://evil.example.com/calendar/ical/x.ics'), null);
eq('http refused', normalizeIcalUrl('http://calendar.google.com/calendar/ical/x.ics'), null);
eq('internal refused', normalizeIcalUrl('https://localhost/calendar/ical/x.ics'), null);
console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
