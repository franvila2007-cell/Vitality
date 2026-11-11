// Checks the Google Calendar writer + sync logic with a fake Google (no real credentials).   npx tsx scripts/google-calendar-test.ts
import { createClient } from '@supabase/supabase-js';
import { createVerify, generateKeyPairSync } from 'crypto';
import { eventIdFor, googleCalendar, serviceAccountFromEnv, signJwt } from '../src/lib/googleCalendar';
import { runGoogleSync, GOOGLE_NO_CALENDAR, GOOGLE_NOT_CONFIGURED } from '../src/lib/googleSync';
import { busyFromIcs } from '../src/lib/googleBusy';
import { maltaToUtc } from '../src/lib/calls';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };

// ── env parsing + JWT ──
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const envJson = JSON.stringify({ client_email: 'robot@proj.iam.gserviceaccount.com', private_key: pem.replace(/\n/g, '\\n') });
const sa = serviceAccountFromEnv(envJson)!;
eq('env JSON parses and fixes escaped newlines', sa.private_key.includes('\n') && sa.client_email, 'robot@proj.iam.gserviceaccount.com');
eq('missing/invalid env → null', [serviceAccountFromEnv(undefined), serviceAccountFromEnv('nope'), serviceAccountFromEnv('{"client_email":"x"}')], [null, null, null]);
const jwt = signJwt(sa, 1_800_000_000); const [h, c, sig] = jwt.split('.');
const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
eq('JWT claims', [claims.iss, claims.aud, claims.scope, claims.exp - claims.iat], ['robot@proj.iam.gserviceaccount.com', 'https://oauth2.googleapis.com/token', 'https://www.googleapis.com/auth/calendar.events', 3600]);
eq('JWT signature verifies with the public key', createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url')), true);
eq('event id is valid base32hex-ish (a-v, 0-9) and stable', [/^[a-v0-9]{5,}$/.test(eventIdFor('A1B2C3D4-0000-1111-2222-333344445555')), eventIdFor('a1b2c3d4-0000-1111-2222-333344445555')], [true, 'calla1b2c3d4000011112222333344445555']);

// ── fake Google ──
type Req = { method: string; url: string; body?: any };
function fakeFetch(opts: { existing?: Set<string>; failWith?: number } = {}) {
  const reqs: Req[] = []; const existing = opts.existing ?? new Set<string>();
  const f = (async (url: any, init: any) => {
    const u = String(url); const method = init?.method ?? 'GET';
    if (u.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
    const body = init?.body ? JSON.parse(init.body) : undefined; reqs.push({ method, url: u, body });
    if (opts.failWith) return new Response('{"error":"x"}', { status: opts.failWith });
    const id = decodeURIComponent(u.split('/events')[1] ?? '').replace(/^\//, '');
    if (method === 'POST') { if (existing.has(body.id)) return new Response('{}', { status: 409 }); existing.add(body.id); return new Response('{}', { status: 200 }); }
    if (method === 'PUT') return existing.has(id) ? new Response('{}', { status: 200 }) : new Response('{}', { status: 404 });
    if (method === 'DELETE') { if (!existing.has(id)) return new Response('{}', { status: 410 }); existing.delete(id); return new Response(null, { status: 204 }); }
    return new Response('{}', { status: 400 });
  }) as unknown as typeof fetch;
  return { f, reqs, existing };
}
const ev = { callId: 'a1b2c3d4-0000-1111-2222-333344445555', title: 'Check-in · Maria', description: 'd', startsAt: maltaToUtc('2026-11-12', '10:00').toISOString(), minutes: 60, kind: 'check_in' as const };
(async () => {
  const fk = fakeFetch(); const g = googleCalendar(sa, fk.f);
  await g.upsert('me@gmail.com', ev);
  eq('create → POST with our id, Malta time, 60 min', [fk.reqs[0].method, fk.reqs[0].url.includes('/calendars/me%40gmail.com/events'), fk.reqs[0].body.id, fk.reqs[0].body.start.timeZone, fk.reqs[0].body.start.dateTime, fk.reqs[0].body.end.dateTime], ['POST', true, eventIdFor(ev.callId), 'Europe/Malta', '2026-11-12T09:00:00.000Z', '2026-11-12T10:00:00.000Z']);
  await g.upsert('me@gmail.com', { ...ev, startsAt: maltaToUtc('2026-11-12', '14:00').toISOString() });
  eq('second upsert (already exists, 409) → PUT updates the same event', [fk.reqs[1].method, fk.reqs[2].method, fk.reqs[2].url.endsWith(`/events/${eventIdFor(ev.callId)}`), fk.reqs[2].body.start.dateTime], ['POST', 'PUT', true, '2026-11-12T13:00:00.000Z']);
  await g.remove('me@gmail.com', ev.callId);
  eq('remove → DELETE and gone', [fk.reqs[3].method, fk.existing.size], ['DELETE', 0]);
  await g.remove('me@gmail.com', ev.callId);
  eq('removing something already gone is fine (410/404)', fk.reqs[4].method, 'DELETE');
  let msg = ''; try { await googleCalendar(sa, fakeFetch({ failWith: 404 }).f).upsert('x', ev); } catch (e) { msg = (e as Error).message; }
  eq('404 gives a helpful message', msg.includes('shared the calendar'), true);
  msg = ''; try { await googleCalendar(sa, fakeFetch({ failWith: 403 }).f).upsert('x', ev); } catch (e) { msg = (e as Error).message; }
  eq('403 tells the coach to share with “Make changes to events”', msg.includes('Make changes to events'), true);

  // ── reconcile against the real database (throwaway client + calls) ──
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const E = 'zz-gsync@vitality.local';
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
  const old = users!.users.find((x) => x.email === E); if (old) { await sb.from('coach_calls').delete().eq('client_id', old.id); await sb.auth.admin.deleteUser(old.id); }
  const cid = (await sb.auth.admin.createUser({ email: E, password: 'Tmp-' + Math.random().toString(36).slice(2) + 'Aa1!', email_confirm: true, user_metadata: { role: 'client', full_name: 'ZZ Sync Client' } })).data.user!.id;
  const future = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
  const mkCall = async (kind: string, startH: number) => (await sb.from('coach_calls').insert({ client_id: cid, kind, note: '', starts_at: future(startH), booked_by: 'client' }).select('id').single()).data!.id as string;
  const A = await mkCall('check_in', 50), B = await mkCall('info', 52);
  const synced = async (id: string) => (await sb.from('coach_calls').select('google_synced_at').eq('id', id).single()).data!.google_synced_at;
  const saved = (await sb.from('coach_settings').select('google_calendar_id').eq('id', 1).single()).data!.google_calendar_id;
  const setCal = (v: string) => sb.from('coach_settings').update({ google_calendar_id: v }).eq('id', 1);
  const status = async () => (await sb.from('coach_settings').select('google_sync_last_error, google_sync_last_run_at').eq('id', 1).single()).data!;
  // we only look at OUR two calls: real calls may also be due, so count via the fake Google's requests
  const mine = (reqs: Req[]) => reqs.filter((r) => [A, B].some((id) => r.url.includes(eventIdFor(id)) || r.body?.id === eventIdFor(id)));

  await setCal('');
  const noGoogle = await runGoogleSync({ admin: sb, google: null });
  eq('no Google key → not_configured, nothing marked synced', [noGoogle.error, await synced(A)], [GOOGLE_NOT_CONFIGURED, null]);
  const noCal = await runGoogleSync({ admin: sb, google: googleCalendar(sa, fakeFetch().f) });
  eq('no calendar address → asks for it', noCal.error, GOOGLE_NO_CALENDAR);

  await setCal('me@gmail.com');
  const f1 = fakeFetch(); await runGoogleSync({ admin: sb, google: googleCalendar(sa, f1.f) });
  eq('first run creates both events and marks them synced', [mine(f1.reqs).filter((r) => r.method === 'POST').length, (await synced(A)) !== null, (await synced(B)) !== null, (await status()).google_sync_last_error], [2, true, true, null]);
  const f2 = fakeFetch(); await runGoogleSync({ admin: sb, google: googleCalendar(sa, f2.f) });
  eq('second run does nothing for unchanged calls', mine(f2.reqs).length, 0);
  await sb.from('coach_calls').update({ starts_at: future(60), updated_at: new Date().toISOString() }).eq('id', A);
  const f3 = fakeFetch({ existing: new Set([eventIdFor(A), eventIdFor(B)]) }); await runGoogleSync({ admin: sb, google: googleCalendar(sa, f3.f) });
  const moved = mine(f3.reqs);
  eq('a moved call is sent again and updates the same event (POST 409 → PUT)', [moved.map((r) => r.method), moved.some((r) => r.url.includes(eventIdFor(B)))], [['POST', 'PUT'], false]);
  await sb.from('coach_calls').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', B);
  const f4 = fakeFetch({ existing: new Set([eventIdFor(B)]) }); await runGoogleSync({ admin: sb, google: googleCalendar(sa, f4.f) });
  eq('a cancelled call is removed from Google', [mine(f4.reqs).map((r) => r.method), f4.existing.has(eventIdFor(B))], [['DELETE'], false]);
  await sb.from('coach_calls').update({ note: 'edit', updated_at: new Date().toISOString() }).eq('id', A);
  const f5 = fakeFetch({ failWith: 403 }); const bad = await runGoogleSync({ admin: sb, google: googleCalendar(sa, f5.f) });
  eq('Google refusing → failure recorded for the coach, call stays un-synced (retries)', [bad.failed >= 1, (bad.error ?? '').includes('Make changes to events'), (await status()).google_sync_last_error?.includes('Make changes')], [true, true, true]);
  const f6 = fakeFetch({ existing: new Set([eventIdFor(A)]) }); const retry = await runGoogleSync({ admin: sb, google: googleCalendar(sa, f6.f) });
  eq('next run retries and succeeds; error cleared', [mine(f6.reqs).length > 0, retry.error, (await status()).google_sync_last_error], [true, null, null]);

  // ── busy reader ignores events Vitality wrote itself ──
  const ics = (uid: string) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//t//EN', 'BEGIN:VEVENT', `UID:${uid}`, 'DTSTART:20261112T090000Z', 'DTEND:20261112T100000Z', 'SUMMARY:x', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const from = new Date('2026-11-12T00:00:00Z'), to = new Date('2026-11-13T00:00:00Z');
  eq('Vitality-written Google event is not double-counted as busy', busyFromIcs(ics(`${eventIdFor(A)}@google.com`), from, to).busy.length, 0);
  eq('an ordinary Google event still blocks', busyFromIcs(ics('abc123@google.com'), from, to).busy.length, 1);

  // cleanup
  await setCal(saved); await sb.from('coach_settings').update({ google_sync_last_error: null, google_sync_last_run_at: null }).eq('id', 1);
  await sb.from('coach_calls').delete().eq('client_id', cid); await sb.auth.admin.deleteUser(cid);
  console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
})();
