// Checks the video call link: cleaning, the client emails (booked / moved / cancelled / reminder), and the Google event.   npx tsx scripts/video-link-test.ts
import { generateKeyPairSync } from 'crypto';
import { cleanVideoLink } from '../src/lib/videoLink';
import { buildClientBookingEmail } from '../src/lib/clientBookingEmail';
import { buildReminderEmail } from '../src/lib/reminderEmail';
import { googleCalendar, serviceAccountFromEnv } from '../src/lib/googleCalendar';
import { maltaToUtc } from '../src/lib/calls';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };

// ── cleaning ──
eq('empty = no link', cleanVideoLink('   '), '');
eq('full https link kept', cleanVideoLink(' https://meet.google.com/abc-defg-hij '), 'https://meet.google.com/abc-defg-hij');
eq('bare address gets https', cleanVideoLink('meet.google.com/abc-defg-hij'), 'https://meet.google.com/abc-defg-hij');
eq('http upgraded to https', cleanVideoLink('http://zoom.us/j/123'), 'https://zoom.us/j/123');
eq('rejects words', cleanVideoLink('my meet link'), null);
eq('rejects javascript:', cleanVideoLink('javascript:alert(1)'), null);
eq('rejects other schemes', cleanVideoLink('ftp://x.com/a'), null);
eq('rejects embedded login', cleanVideoLink('https://user:pw@evil.com'), null);
eq('rejects no domain', cleanVideoLink('hello'), null);
eq('rejects over-long', cleanVideoLink('https://meet.google.com/' + 'a'.repeat(400)), null);

// ── client booking email ──
const link = 'https://meet.google.com/abc-defg-hij';
const startsAt = maltaToUtc('2026-11-10', '10:00').toISOString();
const base = { kind: 'check_in' as const, startsAt, minutes: 60, name: 'Maria Borg', details: 'Have your diary <open>', videoLink: link, appUrl: 'https://app.test' };
const booked = buildClientBookingEmail({ ...base, event: 'booked' });
eq('booked subject', booked.subject, 'Your check-in call is booked: Tue 10 Nov, 10:00');
eq('booked: link in html button + text', [booked.html.includes(`href="${link}"`) && booked.html.includes('Join video call'), booked.text.includes(`Join the video call: ${link}`)], [true, true]);
eq('booked: details escaped', booked.html.includes('Have your diary &lt;open&gt;') && !booked.html.includes('<open>'), true);
const calHref = /href="(https:\/\/calendar\.google\.com[^"]+)"/.exec(booked.html)![1].replace(/&amp;/g, '&');
eq('booked: calendar link carries the video link', new URL(calHref).searchParams.get('details'), `Have your diary <open>\nVideo call: ${link}`);
eq('booked: greets by first name', booked.text.startsWith('Hi Maria,'), true);
const noLink = buildClientBookingEmail({ ...base, event: 'booked', videoLink: '', details: '' });
eq('no link → no join button / line', [noLink.html.includes('Join video call'), noLink.text.includes('video call')], [false, false]);
eq('no link → manage button is the primary one', noLink.html.includes('background:#12a39a') && noLink.html.includes('View or change my call'), true);
const moved = buildClientBookingEmail({ ...base, event: 'moved', previousStartsAt: maltaToUtc('2026-11-09', '09:00').toISOString() });
eq('moved subject + was', [moved.subject, moved.text.includes('(It was Monday 9 November at 09:00.)')], ['Your check-in call has moved to Tue 10 Nov, 10:00', true]);
const cancelled = buildClientBookingEmail({ ...base, event: 'cancelled' });
eq('cancelled: no join link, offers rebooking', [cancelled.html.includes('Join video call'), cancelled.html.includes('Book another time'), cancelled.subject], [false, true, 'Your check-in call on Tue 10 Nov is cancelled']);
eq('a hostile link is escaped in html', buildClientBookingEmail({ ...base, event: 'booked', videoLink: 'https://x.com/a"onmouseover="alert(1)' }).html.includes('"onmouseover'), false);

// ── reminder email ──
const now0 = maltaToUtc('2026-11-09', '10:00');
const rem = buildReminderEmail({ which: 'day', kind: 'info', startsAt, minutes: 60, name: 'Maria', details: '', videoLink: link, appUrl: 'https://app.test', now: now0 });
eq('reminder has Join button first + text line', [rem.html.indexOf('Join video call') < rem.html.indexOf('View or change my call'), rem.text.includes(`Join the video call: ${link}`)], [true, true]);
const rem2 = buildReminderEmail({ which: 'day', kind: 'info', startsAt, minutes: 60, name: 'Maria', details: '', appUrl: 'https://app.test', now: now0 });
eq('reminder without link unchanged', rem2.html.includes('Join video call'), false);

// ── google event ──
(async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const sa = serviceAccountFromEnv(JSON.stringify({ client_email: 'robot@proj.iam.gserviceaccount.com', private_key: pem }))!;
  const bodies: any[] = [];
  const f = (async (url: any, init: any) => {
    if (String(url).includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 });
    bodies.push(JSON.parse(init.body)); return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  const g = googleCalendar(sa, f);
  await g.upsert('cal@x.com', { callId: 'a1b2c3d4-0000-1111-2222-333344445555', title: 'Check-in · Maria', description: 'Check-in call', startsAt, minutes: 60, kind: 'check_in', videoLink: link });
  eq('event location = video link', bodies[0].location, link);
  eq('event description mentions it', bodies[0].description, `Check-in call\nVideo call: ${link}`);
  await g.upsert('cal@x.com', { callId: 'a1b2c3d4-0000-1111-2222-333344445555', title: 'x', description: 'd', startsAt, minutes: 60, kind: 'info' });
  eq('no link → empty location (clears an old one), plain description', [bodies[1].location, bodies[1].description], ['', 'd']);

  console.log(fail ? `\n${fail} FAILED` : '\nall passed');
  process.exit(fail ? 1 : 0);
})();
