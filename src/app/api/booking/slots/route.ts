import { computeBooking, json, loadContext, requireClient } from '@/lib/bookingServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// What a signed-in client sees on the Calls page: the weeks they can book,
// the free times in each, and their own calls. Other clients' calls and the
// coach's Google events are only ever used to remove slots — never shown.
export async function GET() {
  const who = await requireClient();
  if ('error' in who) return who.error;
  try {
    const ctx = await loadContext();
    const data = await computeBooking(ctx, who.userId);
    if (data.unavailable) return json({ error: 'Booking is paused for a moment — please try again in a few minutes.' }, 503);
    return json({ enabled: ctx.settings.enabled, weeks: data.weeks.map((w) => ({
      monday: w.monday, open: w.open, opensAt: w.opensAt?.toISOString() ?? null, slots: w.slots, mine: w.mine,
    })) });
  } catch {
    return json({ error: 'Couldn’t load the times — please try again.' }, 500);
  }
}
