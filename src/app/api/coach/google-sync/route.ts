import { createAdminClient } from '@/lib/supabase/admin';
import { json, requireCoach } from '@/lib/bookingServer';
import { eventIdFor, googleCalendar, serviceAccountFromEnv } from '@/lib/googleCalendar';
import { runGoogleSync } from '@/lib/googleSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Coach only. GET: is Google set up, and who should the calendar be shared with?
// (The robot's email address isn't secret; the key is never returned.)
export async function GET() {
  const who = await requireCoach();
  if ('error' in who) return who.error;
  const sa = serviceAccountFromEnv();
  return json({ configured: !!sa, robotEmail: sa?.client_email ?? null });
}

// Coach only. "Test connection": puts a throwaway event on the calendar and
// removes it again, then syncs anything waiting — so the coach sees at once
// whether Google accepts it.
export async function POST() {
  const who = await requireCoach();
  if ('error' in who) return who.error;
  const sa = serviceAccountFromEnv();
  if (!sa) return json({ error: 'The Google key isn’t added to Vitality yet.' }, 503);
  const admin = createAdminClient();
  const { data } = await admin.from('coach_settings').select('google_calendar_id').eq('id', 1).maybeSingle();
  const calendarId = data?.google_calendar_id?.trim();
  if (!calendarId) return json({ error: 'Type your Google Calendar address first and press Save.' }, 400);
  const google = googleCalendar(sa);
  const testId = crypto.randomUUID();
  try {
    const start = new Date(Date.now() + 36 * 3600000);
    start.setMinutes(0, 0, 0);
    await google.upsert(calendarId, { callId: testId, kind: 'check_in', title: 'Vitality connection test (safe to delete)', description: 'Vitality is connected to this calendar.', startsAt: start.toISOString(), minutes: 30 });
    await google.remove(calendarId, testId);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Google didn’t accept the test.' }, 502);
  }
  const r = await runGoogleSync({ admin, google });
  return json({ ok: true, synced: r.synced, removed: r.removed, eventIdExample: eventIdFor(testId).slice(0, 8) });
}
