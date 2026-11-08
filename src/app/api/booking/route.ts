import { after } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeBooking, json, loadContext, requireClient } from '@/lib/bookingServer';
import { maltaParts, weekStartOf } from '@/lib/calls';
import { notifyCoach } from '@/lib/bookingNotify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  kind: z.enum(['check_in', 'info']),
  starts_at: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  replaceId: z.string().uuid().optional(),
});

const RPC_MESSAGES: Record<string, [number, string]> = {
  slot_taken: [409, 'Someone just took that time — please pick another.'],
  already_booked: [409, 'You already have that call booked this week.'],
  outside_hours: [409, 'That time isn’t available any more — please pick another.'],
  in_the_past: [409, 'That time has passed — please pick another.'],
  not_found: [404, 'That booking can’t be changed any more.'],
};

// Book a call (or move an existing one with replaceId). Every rule is checked
// here against the real, current data — the browser's list is only a convenience.
export async function POST(req: Request) {
  const who = await requireClient();
  if ('error' in who) return who.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Pick a time first.' }, 400);
  const { kind, starts_at, replaceId } = parsed.data;

  try {
    const ctx = await loadContext();
    if (!ctx.settings.enabled) return json({ error: 'Booking is switched off right now.' }, 403);
    const data = await computeBooking(ctx, who.userId, new Date(), replaceId);
    if (data.unavailable) return json({ error: 'Booking is paused for a moment — please try again in a few minutes.' }, 503);

    const at = maltaParts(starts_at);
    const week = data.weeks.find((w) => w.monday === weekStartOf(at.date));
    if (!week?.open || !week.slots) return json({ error: 'That week isn’t open for booking yet.' }, 403);
    if (!(week.slots[at.date] ?? []).includes(at.time)) return json({ error: 'That time isn’t available any more — please pick another.' }, 409);

    const admin = createAdminClient();
    // For a move, remember where the call was so the email can say so.
    const previous = replaceId ? (await admin.from('coach_calls').select('starts_at').eq('id', replaceId).eq('client_id', who.userId).maybeSingle()).data?.starts_at : undefined;
    const { error } = await admin.rpc('client_book_call', { p_client: who.userId, p_kind: kind, p_starts_at: new Date(starts_at).toISOString(), p_replace: replaceId ?? null });
    if (error) {
      const known = Object.entries(RPC_MESSAGES).find(([code]) => error.message.includes(code));
      if (known) return json({ error: known[1][1] }, known[1][0]);
      return json({ error: 'Couldn’t book that — please try again.' }, 500);
    }
    after(async () => {
      const { data: p } = await admin.from('profiles').select('full_name, email').eq('id', who.userId).maybeSingle();
      await notifyCoach(admin, {
        event: replaceId ? 'moved' : 'booked', clientName: p?.full_name || p?.email || '', kind, startsAt: new Date(starts_at).toISOString(), previousStartsAt: previous,
      }, { replyTo: p?.email });
    });
    return json({ ok: true });
  } catch {
    return json({ error: 'Couldn’t book that — please try again.' }, 500);
  }
}
