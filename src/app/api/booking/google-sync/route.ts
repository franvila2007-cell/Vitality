import { createAdminClient } from '@/lib/supabase/admin';
import { json } from '@/lib/bookingServer';
import { googleCalendar, serviceAccountFromEnv } from '@/lib/googleCalendar';
import { runGoogleSync } from '@/lib/googleSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Called every 5 minutes by the database (pg_cron → pg_net). Takes no input
// and returns only counts: it just brings Google Calendar in line with the
// calls in the database, which is safe to repeat any number of times.
export async function POST() {
  const sa = serviceAccountFromEnv();
  try {
    const r = await runGoogleSync({ admin: createAdminClient(), google: sa ? googleCalendar(sa) : null });
    return json({ synced: r.synced, removed: r.removed, failed: r.failed, ok: r.error === null });
  } catch {
    return json({ ok: false }, 500);
  }
}
