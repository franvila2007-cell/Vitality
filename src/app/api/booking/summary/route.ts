import { createAdminClient } from '@/lib/supabase/admin';
import { json, loadContext, requireClient } from '@/lib/bookingServer';
import { bookableWeeks } from '@/lib/booking';
import { maltaParts, weekRangeUtc, weekdayOf } from '@/lib/calls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A light read for the Today screen: the client's next call (for the reminder)
// and whether there's a week open with calls still to book. No Google here.
export async function GET() {
  const who = await requireClient();
  if ('error' in who) return who.error;
  const ctx = await loadContext();
  const now = new Date();
  const weeks = bookableWeeks(now, ctx.settings);
  const admin = createAdminClient();
  const { data: calls } = await admin.from('coach_calls').select('id, kind, starts_at, duration_min')
    .eq('client_id', who.userId).in('status', ['scheduled', 'done']).gte('starts_at', weekRangeUtc(weeks[0].monday).from).lt('starts_at', weekRangeUtc(weeks[1].monday).to).order('starts_at');
  const mine = calls ?? [];
  const upcoming = mine.filter((c) => new Date(c.starts_at).getTime() + c.duration_min * 60000 > now.getTime());
  // Nudge about this week only early in it (Mon–Wed, while there are days left); next week whenever it's open.
  const earlyInWeek = weekdayOf(maltaParts(now).date) <= 3;
  const nudge = weeks.filter((w, i) => w.open && (i === 1 || earlyInWeek)).map((w) => {
    const { from, to } = weekRangeUtc(w.monday);
    const inWeek = mine.filter((c) => c.starts_at >= from && c.starts_at < to);
    const missing = (['check_in', 'info'] as const).filter((k) => !inWeek.some((c) => c.kind === k));
    return { monday: w.monday, missing };
  }).find((w) => w.missing.length > 0) ?? null;
  return json({ enabled: ctx.settings.enabled, next: upcoming[0] ?? null, nudge: ctx.settings.enabled ? nudge : null });
}
