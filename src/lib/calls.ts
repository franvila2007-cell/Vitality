import type { CoachCallKind, CoachCallRow } from '@/lib/supabase/database.types';
import { addDays } from '@/lib/date';

// Coach calendar helpers. Everything the coach sees is Malta time; calls are
// stored as UTC instants (timestamptz), so converting at the edges is the only
// place time zones matter.

export const CALL_TZ = 'Europe/Malta';
export const CALL_MINUTES = 60;

export const KIND_META: Record<CoachCallKind, { label: string; long: string; block: string; chip: string; dot: string }> = {
  check_in: {
    label: 'Check-in', long: 'Check-in call',
    block: 'bg-[#e8f7f3] border-[#26A88A] text-[#17705b]', chip: 'bg-[#e8f7f3] text-[#17705b] border-[#26A88A]/40', dot: '#26A88A',
  },
  info: {
    label: 'Info call', long: 'Info call (Vitality course)',
    block: 'bg-[#f1ecfc] border-[#7c5cd6] text-[#4b34a0]', chip: 'bg-[#f1ecfc] text-[#4b34a0] border-[#7c5cd6]/40', dot: '#7c5cd6',
  },
};

// Offset of Malta from UTC (ms) at a given instant — DST-aware via Intl.
function tzOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CALL_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(utcMs / 1000) * 1000;
}

/** "2026-11-04" + "10:30" in Malta → the UTC instant. */
export function maltaToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, h, mi);
  let ms = naive - tzOffsetMs(naive);
  ms = naive - tzOffsetMs(ms); // second pass settles the hours around a DST change
  return new Date(ms);
}

/** A UTC instant → Malta date, time and minutes-since-midnight. */
export function maltaParts(at: string | Date): { date: string; time: string; minutes: number } {
  const d = typeof at === 'string' ? new Date(at) : at;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: CALL_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  const time = `${g('hour')}:${g('minute')}`;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time, minutes: Number(g('hour')) * 60 + Number(g('minute')) };
}

/** 1 = Monday … 7 = Sunday for a YYYY-MM-DD date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1;
}

/** The Monday of the week containing `date`. */
export function weekStartOf(date: string): string {
  return addDays(date, -(weekdayOf(date) - 1));
}

/** [start, end) of a Mon–Sun week as UTC ISO strings, for querying. */
export function weekRangeUtc(monday: string): { from: string; to: string } {
  return { from: maltaToUtc(monday, '00:00').toISOString(), to: maltaToUtc(addDays(monday, 7), '00:00').toISOString() };
}

export function callEnd(c: Pick<CoachCallRow, 'starts_at' | 'duration_min'>): Date {
  return new Date(new Date(c.starts_at).getTime() + c.duration_min * 60000);
}

export function dayLabel(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', opts);
}

export function timeRangeLabel(c: Pick<CoachCallRow, 'starts_at' | 'duration_min'>): string {
  return `${maltaParts(c.starts_at).time}–${maltaParts(callEnd(c)).time}`;
}

const gcalStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** One-click "add this call to my Google Calendar" link (prefilled event). */
export function googleCalendarUrl(c: Pick<CoachCallRow, 'starts_at' | 'duration_min' | 'kind' | 'note'>, name: string): string {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: callTitle(c.kind, name),
    dates: `${gcalStamp(new Date(c.starts_at))}/${gcalStamp(callEnd(c))}`,
    details: [KIND_META[c.kind].long, c.note].filter(Boolean).join('\n'),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function callTitle(kind: CoachCallKind, name: string): string {
  return `${KIND_META[kind].label} · ${name}`;
}

// ── iCalendar feed (Google Calendar → "From URL") ─────────────────────────

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// RFC 5545 line folding: max 75 octets per line, continuation lines start with a space.
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (enc.encode(cur + ch).length > limit) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(calls: { call: CoachCallRow; name: string }[], now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vitality//Coach calls//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Vitality calls', 'X-WR-TIMEZONE:Europe/Malta', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  for (const { call, name } of calls) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${call.id}@vitality-one-zeta.vercel.app`,
      `DTSTAMP:${gcalStamp(now)}`,
      `DTSTART:${gcalStamp(new Date(call.starts_at))}`,
      `DTEND:${gcalStamp(callEnd(call))}`,
      `SUMMARY:${icsEscape(callTitle(call.kind, name))}`,
      `DESCRIPTION:${icsEscape([KIND_META[call.kind].long, call.note].filter(Boolean).join('\n'))}`,
      `LAST-MODIFIED:${gcalStamp(new Date(call.updated_at))}`,
      'TRANSP:OPAQUE', 'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
