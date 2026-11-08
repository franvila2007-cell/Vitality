import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchBusy } from '@/lib/googleBusy';
import { bookableWeeks, freeSlots, type Avail, type BookingSettings, type Interval } from '@/lib/booking';
import { weekRangeUtc } from '@/lib/calls';
import { addDays } from '@/lib/date';
import type { CoachCallRow } from '@/lib/supabase/database.types';

// Server-side pieces shared by the booking API routes. Clients never touch the
// coach tables directly: they ask these routes, which use the service role.

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** The signed-in, active client (id) — or an error response to return. */
export async function requireClient(): Promise<{ userId: string } | { error: NextResponse }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: json({ error: 'Please sign in again.' }, 401) };
  const { data: p } = await supabase.from('profiles').select('role, archived_at').eq('id', user.id).maybeSingle();
  if (!p || p.role !== 'client' || p.archived_at) return { error: json({ error: 'Booking is for Vitality clients.' }, 403) };
  return { userId: user.id };
}

export async function requireCoach(): Promise<{ error: NextResponse } | { userId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: json({ error: 'unauthorized' }, 401) };
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (p?.role !== 'coach') return { error: json({ error: 'forbidden' }, 403) };
  return { userId: user.id };
}

export type BookingContext = {
  settings: BookingSettings;
  googleUrls: string[];
  availability: Avail[];
};

export async function loadContext(): Promise<BookingContext> {
  const admin = createAdminClient();
  const [{ data: s }, { data: a }] = await Promise.all([
    admin.from('coach_settings').select('google_ical_urls, booking_open_weekday, booking_open_time, booking_enabled').eq('id', 1).maybeSingle(),
    admin.from('coach_availability').select('weekday, start_time, end_time'),
  ]);
  return {
    settings: { enabled: s?.booking_enabled ?? true, openWeekday: s?.booking_open_weekday ?? 5, openTime: s?.booking_open_time ?? '12:00:00' },
    googleUrls: s?.google_ical_urls ?? [],
    availability: a ?? [],
  };
}

const toInterval = (c: Pick<CoachCallRow, 'starts_at' | 'duration_min'>): Interval => {
  const start = new Date(c.starts_at).getTime();
  return { start, end: start + c.duration_min * 60000 };
};

/**
 * Free slots for the weeks a client may book, plus their own calls.
 * `ignoreCallId` lets a client moving a call treat their current slot as free.
 * Returns `unavailable` when Google can't be read — we'd rather pause booking
 * than risk double-booking the coach.
 */
export async function computeBooking(ctx: BookingContext, userId: string, now = new Date(), ignoreCallId?: string) {
  const admin = createAdminClient();
  const weeks = bookableWeeks(now, ctx.settings);
  const rangeFrom = weekRangeUtc(weeks[0].monday).from;
  const rangeTo = weekRangeUtc(addDays(weeks[1].monday, 0)).to;

  const [callsRes, google] = await Promise.all([
    admin.from('coach_calls').select('id, client_id, kind, starts_at, duration_min, status').in('status', ['scheduled', 'done']).gte('starts_at', rangeFrom).lt('starts_at', rangeTo),
    ctx.googleUrls.length ? fetchBusy(ctx.googleUrls, new Date(rangeFrom), new Date(rangeTo)) : Promise.resolve({ busy: [] as Interval[], errors: [] as string[], events: 0, allDay: 0 }),
  ]);
  if (callsRes.error) throw new Error('calls');
  if (google.errors.length) return { unavailable: true as const };

  const calls = callsRes.data ?? [];
  const taken = calls.filter((c) => c.id !== ignoreCallId).map(toInterval);
  const mine = calls.filter((c) => c.client_id === userId).map((c) => ({ id: c.id, kind: c.kind as 'check_in' | 'info', starts_at: c.starts_at, duration_min: c.duration_min }));

  const result = weeks.map((w) => ({
    ...w,
    slots: w.open ? freeSlots({ monday: w.monday, now, availability: ctx.availability, taken, busy: google.busy }) : null,
    mine: mine.filter((c) => c.starts_at >= weekRangeUtc(w.monday).from && c.starts_at < weekRangeUtc(w.monday).to),
  }));
  return { unavailable: false as const, weeks: result, googleConnected: ctx.googleUrls.length > 0 };
}
