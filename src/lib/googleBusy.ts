import ical, { type VEvent } from 'node-ical';
import { maltaToUtc } from '@/lib/calls';

// Reads the coach's private Google Calendar link ("Secret address in iCal
// format") and turns it into blocked time ranges, so clients booking a call
// only ever see slots that are free in Google too. Server-side only.

export type Busy = { start: number; end: number }; // epoch ms, end exclusive

const pad = (n: number) => String(n).padStart(2, '0');
// node-ical gives all-day events as local midnight, so read the date with local getters.
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Blocked ranges from an .ics file between `from` and `to`. Every event blocks (calls or not); free ("transparent") and cancelled ones don't. */
export function busyFromIcs(ics: string, from: Date, to: Date): { busy: Busy[]; events: number; allDay: number } {
  const data = ical.sync.parseICS(ics);
  const busy: Busy[] = [];
  let events = 0, allDay = 0;
  for (const raw of Object.values(data)) {
    if (!raw || raw.type !== 'VEVENT') continue;
    const e = raw as VEvent;
    if (e.status === 'CANCELLED' || e.transparency === 'TRANSPARENT') continue;
    let instances;
    try {
      instances = ical.expandRecurringEvent(e, { from, to, expandOngoing: true });
    } catch {
      continue; // one odd event shouldn't take the whole calendar down
    }
    for (const inst of instances) {
      if (inst.event?.status === 'CANCELLED' || inst.event?.transparency === 'TRANSPARENT') continue;
      events++;
      if (inst.isFullDay) {
        allDay++;
        const startDay = localDate(inst.start);
        const endDay = localDate(inst.end);
        // A one-day event can come back with end == start; DTEND is exclusive, so make it at least one day.
        const last = endDay > startDay ? endDay : localDate(new Date(inst.start.getFullYear(), inst.start.getMonth(), inst.start.getDate() + 1));
        busy.push({ start: maltaToUtc(startDay, '00:00').getTime(), end: maltaToUtc(last, '00:00').getTime() });
      } else {
        busy.push({ start: inst.start.getTime(), end: Math.max(inst.end.getTime(), inst.start.getTime() + 60000) });
      }
    }
  }
  return { busy, events, allDay };
}

/** Only Google's own calendar addresses are fetched — never an arbitrary URL. */
export function normalizeIcalUrl(raw: string): string | null {
  let s = raw.trim();
  if (s.startsWith('webcal://')) s = 'https://' + s.slice('webcal://'.length);
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.hostname !== 'calendar.google.com' || !u.pathname.startsWith('/calendar/ical/')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const cache = new Map<string, { at: number; text: string }>();
const TTL_MS = 2 * 60 * 1000;
const MAX_BYTES = 8 * 1024 * 1024;

async function fetchIcs(url: string, fresh = false): Promise<string> {
  const hit = cache.get(url);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.text;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), cache: 'no-store', headers: { Accept: 'text/calendar' } });
    if (!res.ok) throw new Error(`Google answered ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('calendar too large');
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('not a calendar link');
    cache.set(url, { at: Date.now(), text });
    return text;
  } catch (e) {
    // A brief Google hiccup shouldn't stop bookings: fall back to the last good copy if we have one.
    if (!fresh && hit) return hit.text;
    throw e;
  }
}

/** Blocked ranges across all of the coach's calendar links. `errors` lists links that couldn't be read (by position, never the secret). */
export async function fetchBusy(urls: string[], from: Date, to: Date, opts: { fresh?: boolean } = {}): Promise<{ busy: Busy[]; errors: string[]; events: number; allDay: number }> {
  const busy: Busy[] = [];
  const errors: string[] = [];
  let events = 0, allDay = 0;
  await Promise.all(urls.map(async (raw, i) => {
    const url = normalizeIcalUrl(raw);
    if (!url) { errors.push(`Link ${i + 1} isn’t a Google Calendar iCal address.`); return; }
    try {
      const r = busyFromIcs(await fetchIcs(url, opts.fresh), from, to);
      busy.push(...r.busy); events += r.events; allDay += r.allDay;
    } catch (e) {
      errors.push(`Link ${i + 1}: ${e instanceof Error ? e.message : 'couldn’t be read'}`);
    }
  }));
  return { busy, errors, events, allDay };
}

export function overlapsAny(busy: Busy[], start: number, end: number): boolean {
  return busy.some((b) => b.start < end && b.end > start);
}
