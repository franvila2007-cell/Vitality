import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { json, requireCoach } from '@/lib/bookingServer';
import { fetchBusy, normalizeIcalUrl } from '@/lib/googleBusy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORTNIGHT = 14 * 86400000;

async function status(urls: string[]) {
  if (urls.length === 0) return { connected: false, links: 0, events: 0, allDay: 0, errors: [] as string[] };
  const now = new Date();
  const r = await fetchBusy(urls, now, new Date(now.getTime() + FORTNIGHT), { fresh: true });
  return { connected: r.errors.length === 0, links: urls.length, events: r.events, allDay: r.allDay, errors: r.errors };
}

// How the Google link is doing (coach only). Never returns the link itself —
// it's a secret that lets anyone read the whole calendar.
export async function GET() {
  const who = await requireCoach();
  if ('error' in who) return who.error;
  const { data } = await createAdminClient().from('coach_settings').select('google_ical_urls').eq('id', 1).maybeSingle();
  return json(await status(data?.google_ical_urls ?? []));
}

// Save the coach's private Google Calendar link(s). Each must be a Google iCal
// address and must actually load, so "connected" is always true when it says so.
export async function POST(req: Request) {
  const who = await requireCoach();
  if ('error' in who) return who.error;
  const parsed = z.object({ urls: z.array(z.string().max(500)).max(5) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Paste the link first.' }, 400);
  const urls = parsed.data.urls.map((u) => u.trim()).filter(Boolean);
  if (urls.length === 0) return json({ error: 'Paste the link first.' }, 400);
  const clean = urls.map(normalizeIcalUrl);
  if (clean.some((u) => !u)) {
    return json({ error: 'That doesn’t look like the “Secret address in iCal format” from Google Calendar. It starts with https://calendar.google.com/calendar/ical/…' }, 422);
  }
  const good = clean as string[];
  const s = await status(good);
  if (!s.connected) return json({ error: `Google didn’t let me read that link (${s.errors.join('; ')}). Copy it again from Google Calendar.` }, 422);
  const { error } = await createAdminClient().from('coach_settings').update({ google_ical_urls: good, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) return json({ error: 'Couldn’t save — please try again.' }, 500);
  return json(s);
}

export async function DELETE() {
  const who = await requireCoach();
  if ('error' in who) return who.error;
  const { error } = await createAdminClient().from('coach_settings').update({ google_ical_urls: [], updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) return json({ error: 'Couldn’t disconnect — please try again.' }, 500);
  return json({ connected: false, links: 0, events: 0, allDay: 0, errors: [] });
}
