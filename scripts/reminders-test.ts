// Checks call-reminder emails: the template, and the claim/send/retry logic against the real DB with a fake sender.
// Time is simulated ~400 days ahead so real clients' calls are never claimed.   npx tsx scripts/reminders-test.ts
import { createClient } from '@supabase/supabase-js';
import { buildReminderEmail } from '../src/lib/reminderEmail';
import { runReminders, NOT_CONFIGURED, type Sender } from '../src/lib/reminders';
import { maltaToUtc } from '../src/lib/calls';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };

// ── template ────────────────────────────────────────────────
const now0 = maltaToUtc('2026-11-09', '10:00');
const startsTomorrow = maltaToUtc('2026-11-10', '10:00').toISOString();
const day = buildReminderEmail({ which: 'day', kind: 'check_in', startsAt: startsTomorrow, minutes: 60, name: 'Maria Borg', details: 'WhatsApp call <b>me</b>', appUrl: 'https://app.test', now: now0 });
eq('day subject', day.subject, 'Reminder: your check-in call with Francesco tomorrow at 10:00');
eq('text has date+range', day.text.includes('Tuesday 10 November, 10:00–11:00 (Malta time)'), true);
eq('greets by first name', day.text.startsWith('Hi Maria,'), true);
eq('details escaped in html', day.html.includes('WhatsApp call &lt;b&gt;me&lt;/b&gt;') && !day.html.includes('<b>me</b>'), true);
eq('manage link', day.html.includes('https://app.test/calls') && day.text.includes('https://app.test/calls'), true);
eq('google calendar link', day.html.includes('calendar.google.com/calendar/render?action=TEMPLATE'), true);
const hour = buildReminderEmail({ which: 'hour', kind: 'info', startsAt: maltaToUtc('2026-11-09', '11:00').toISOString(), minutes: 60, name: '', details: '', appUrl: 'https://app.test', now: now0 });
eq('hour subject', hour.subject, 'Starting soon: your info call with Francesco at 11:00');
eq('no name → "Hi there"', hour.text.startsWith('Hi there,'), true);
eq('no details → no empty paragraph', hour.html.includes('white-space:pre-line'), false);
const sameDay = buildReminderEmail({ which: 'day', kind: 'info', startsAt: maltaToUtc('2026-11-09', '18:00').toISOString(), minutes: 60, name: 'A', details: '', appUrl: 'x', now: now0 });
eq('same-day wording', sameDay.subject.includes('today at 18:00'), true);

// ── claim / send / retry ────────────────────────────────────
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const E1 = 'tmp-rem-client@vitality.local', E2 = 'tmp-rem-archived@vitality.local';
const H = 3600000;
(async () => {
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
  for (const e of [E1, E2]) { const u = users!.users.find((x) => x.email === e); if (u) { await sb.from('coach_calls').delete().eq('client_id', u.id); await sb.auth.admin.deleteUser(u.id); } }
  const mk = async (email: string, name: string) => (await sb.auth.admin.createUser({ email, password: 'Tmp-' + Math.random().toString(36).slice(2) + 'Aa1', email_confirm: true, user_metadata: { role: 'client', full_name: name } })).data.user!.id;
  const c1 = await mk(E1, 'Rem Client'), c2 = await mk(E2, 'Rem Archived');
  await sb.from('profiles').update({ archived_at: new Date().toISOString() }).eq('id', c2);
  const sim = new Date(Date.now() + 400 * 24 * H); // simulated "now"
  const at = (offsetMs: number) => new Date(sim.getTime() + offsetMs).toISOString();
  const old = new Date(sim.getTime() - 5 * 24 * H).toISOString();
  const call = async (client: string, kind: string, startOffset: number, created = old) => (await sb.from('coach_calls').insert({ client_id: client, kind, note: '', starts_at: at(startOffset), created_at: created }).select('id').single()).data!.id as string;
  const flags = async (id: string) => (await sb.from('coach_calls').select('reminded_day_at, reminded_hour_at').eq('id', id).single()).data!;

  const A = await call(c1, 'check_in', 20 * H);                              // day reminder due
  const B = await call(c1, 'info', 20 * H + 2 * 3600000, at(0));             // booked just now, inside the window → silent skip
  const C = await call(c1, 'check_in', 50 * 60000);                          // starts in 50 min → hour reminder (day silently skipped)
  const D = await call(c1, 'info', 30 * H);                                  // not yet
  const X = await call(c2, 'check_in', 21 * H);                              // archived client → claimed, never emailed

  const sent: { to: string; subject: string; key: string }[] = [];
  const ok: Sender = async (m) => { sent.push({ to: m.to, subject: m.subject, key: m.idempotencyKey }); };

  // no sender configured: nothing claimed, error recorded
  const none = await runReminders({ admin: sb, send: null, now: sim, pauseMs: 0 });
  eq('no sender → not configured, nothing claimed', [none.error, none.claimed, (await flags(A)).reminded_day_at], [NOT_CONFIGURED, 0, null]);
  eq('…and the status is stored for the coach', (await sb.from('coach_settings').select('reminder_last_error').eq('id', 1).single()).data!.reminder_last_error, NOT_CONFIGURED);

  const r1 = await runReminders({ admin: sb, send: ok, now: sim, pauseMs: 0 });
  eq('run 1 sends day(A) + hour(C) to the client', sent.map((s) => s.subject.split(' with')[0] + '|' + s.to).sort(), ['Reminder: your check-in call|' + E1, 'Starting soon: your check-in call|' + E1].sort());
  eq('run 1 counts', [r1.sent, r1.skipped, r1.failed, r1.error], [2, 1, 0, null]);
  eq('A day-flagged', (await flags(A)).reminded_day_at !== null, true);
  eq('B skipped silently (flagged, not emailed)', (await flags(B)).reminded_day_at !== null, true);
  eq('D untouched', (await flags(D)).reminded_day_at, null);
  eq('archived client flagged but not emailed', [(await flags(X)).reminded_day_at !== null, sent.some((s) => s.to === E2)], [true, false]);

  const before = sent.length;
  const r2 = await runReminders({ admin: sb, send: ok, now: sim, pauseMs: 0 });
  eq('run 2 sends nothing (each reminder exactly once)', [sent.length - before, r2.claimed], [0, 0]);

  // 7 hours later D is within 24h
  const later = new Date(sim.getTime() + 7 * H);
  const r3 = await runReminders({ admin: sb, send: ok, now: later, pauseMs: 0 });
  eq('D gets its day reminder 7h later', [r3.sent, sent[sent.length - 1].subject.startsWith('Reminder: your info call')], [1, true]);

  // failure → un-claimed → retried
  const F = await call(c1, 'check_in', 26 * H + 7 * H);                      // 26h after `later`... within 24h of later+3h
  const later2 = new Date(sim.getTime() + 10 * H);
  const boom: Sender = async () => { throw new Error('Resend rejected the email (403): domain not verified'); };
  const rf = await runReminders({ admin: sb, send: boom, now: later2, pauseMs: 0 });
  eq('failed send is reported', [rf.failed, rf.sent, rf.error?.includes('domain not verified')], [1, 0, true]);
  eq('…and un-claimed so it retries', (await flags(F)).reminded_day_at, null);
  eq('…error shown to the coach', (await sb.from('coach_settings').select('reminder_last_error').eq('id', 1).single()).data!.reminder_last_error?.includes('domain not verified'), true);
  const rr = await runReminders({ admin: sb, send: ok, now: later2, pauseMs: 0 });
  eq('retry succeeds and clears the error', [rr.sent, rr.error, (await sb.from('coach_settings').select('reminder_last_error').eq('id', 1).single()).data!.reminder_last_error], [1, null, null]);

  // moving a call re-arms its reminders
  await sb.from('coach_calls').update({ starts_at: at(60 * H) }).eq('id', A);
  const fa = await flags(A);
  eq('moving a call resets its flags', [fa.reminded_day_at, fa.reminded_hour_at], [null, null]);
  await sb.from('coach_calls').update({ note: 'edited' }).eq('id', D);
  eq('editing something else keeps the flags', (await flags(D)).reminded_day_at !== null, true);

  // cancelled calls get nothing; switch-off respected
  const G = await call(c1, 'info', 12 * H); await sb.from('coach_calls').update({ status: 'cancelled' }).eq('id', G);
  await sb.from('coach_settings').update({ reminder_emails_enabled: false }).eq('id', 1);
  const off = await runReminders({ admin: sb, send: ok, now: new Date(sim.getTime() + 11 * H), pauseMs: 0 });
  eq('switched off → nothing claimed', off.claimed, 0);
  await sb.from('coach_settings').update({ reminder_emails_enabled: true }).eq('id', 1);
  const on = await runReminders({ admin: sb, send: ok, now: new Date(sim.getTime() + 11 * H), pauseMs: 0 });
  eq('cancelled call never reminded', (await flags(G)).reminded_day_at, null);
  void on;

  // direct access is closed
  const anon = createClient(process.env.SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const direct = await anon.rpc('claim_due_reminders', {});
  eq('the claim function is not callable by clients', direct.error ? 'blocked' : 'OPEN', 'blocked');

  // cleanup
  for (const id of [c1, c2]) { await sb.from('coach_calls').delete().eq('client_id', id); await sb.auth.admin.deleteUser(id); }
  await sb.from('coach_settings').update({ reminder_last_run_at: null, reminder_last_error: null, reminder_emails_enabled: true }).eq('id', 1);
  console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
})();
