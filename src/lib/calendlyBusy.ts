import type { Busy } from '@/lib/googleBusy';

// Reads the coach's booked Calendly meetings (consultations etc.) straight from
// the Calendly API, so a slot someone booked on Calendly disappears from client
// booking in the app instantly. Server-side only.
//
// Needs env CALENDLY_TOKEN: a Calendly personal access token
// (Calendly → Integrations & apps → API and webhooks → Personal access tokens).
// No token → Calendly is simply skipped.

const API = 'https://api.calendly.com';
const TTL_MS = 60 * 1000;
let me: string | null = null;
const cache = new Map<string, { at: number; busy: Busy[] }>();

async function get(path: string, token: string) {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Calendly answered ${res.status}`);
  return res.json();
}

export const calendlyConfigured = () => Boolean(process.env.CALENDLY_TOKEN?.trim());

/** Busy ranges for every active Calendly meeting overlapping [from, to). `error` set when Calendly couldn't be read. */
export async function fetchCalendlyBusy(from: Date, to: Date, opts: { fresh?: boolean } = {}): Promise<{ busy: Busy[]; events: number; error?: string }> {
  const token = process.env.CALENDLY_TOKEN?.trim();
  if (!token) return { busy: [], events: 0 };
  const key = `${from.getTime()}-${to.getTime()}`;
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL_MS) return { busy: hit.busy, events: hit.busy.length };
  try {
    if (!me) me = (await get('/users/me', token)).resource.uri as string;
    // Start a day early so a meeting that began before `from` but runs into it still blocks.
    const q = new URLSearchParams({
      user: me,
      status: 'active',
      min_start_time: new Date(from.getTime() - 86400000).toISOString(),
      max_start_time: to.toISOString(),
      count: '100',
      sort: 'start_time:asc',
    });
    const busy: Busy[] = [];
    let next: string | null = `/scheduled_events?${q}`;
    for (let page = 0; next && page < 10; page++) {
      const data: { collection: { start_time: string; end_time: string }[]; pagination: { next_page: string | null } } = await get(next, token);
      for (const e of data.collection) {
        const start = Date.parse(e.start_time), end = Date.parse(e.end_time);
        if (Number.isFinite(start) && Number.isFinite(end) && end > from.getTime() && start < to.getTime()) busy.push({ start, end });
      }
      next = data.pagination?.next_page ?? null;
    }
    cache.set(key, { at: Date.now(), busy });
    return { busy, events: busy.length };
  } catch (e) {
    // A brief hiccup shouldn't stop bookings: use the last good copy if we have one.
    if (!opts.fresh && hit) return { busy: hit.busy, events: hit.busy.length };
    return { busy: [], events: 0, error: e instanceof Error ? e.message : 'Calendly couldn’t be read' };
  }
}
