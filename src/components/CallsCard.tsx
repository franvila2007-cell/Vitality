'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { KIND_META, dayLabel, maltaParts } from '@/lib/calls';
import { addDays } from '@/lib/date';

type Summary = {
  enabled: boolean;
  next: { id: string; kind: 'check_in' | 'info'; starts_at: string; duration_min: number } | null;
  nudge: { monday: string; missing: ('check_in' | 'info')[] } | null;
};

// Today-screen card for calls: a reminder from the day before a call, otherwise
// a nudge when there's a week open with calls still to book. Renders nothing
// when there's nothing to say (or if the lookup fails — it's only a convenience).
export default function CallsCard() {
  const [s, setS] = useState<Summary | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/booking/summary', { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as Summary;
        if (!cancelled) { setS(body); setNow(Date.now()); }
      } catch { /* silent: the Calls tab still works */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!s || !s.enabled) return null;

  if (s.next) {
    const start = new Date(s.next.starts_at).getTime();
    const p = maltaParts(s.next.starts_at);
    const today = maltaParts(new Date(now)).date;
    // Reminder window: from the day before the call until it starts.
    if (p.date === today || p.date === addDays(today, 1)) {
      const when = p.date === today ? (start <= now ? 'now' : `today at ${p.time}`) : `tomorrow at ${p.time}`;
      return (
        <Link href="/calls" className={`flex items-center gap-3 rounded-2xl border p-4 ${KIND_META[s.next.kind].chip}`}>
          <span className="text-2xl" aria-hidden>📞</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{KIND_META[s.next.kind].label} with Francesco {when}</span>
            <span className="block text-2xs opacity-75">{dayLabel(p.date, { weekday: 'long', day: 'numeric', month: 'long' })} · {p.time}–{maltaParts(new Date(start + s.next.duration_min * 60000)).time} Malta time</span>
          </span>
          <span className="text-xs font-semibold">View →</span>
        </Link>
      );
    }
  }

  if (s.nudge) {
    const week = `${dayLabel(s.nudge.monday, { day: 'numeric', month: 'short' })}`;
    const items = s.nudge.missing.map((k) => KIND_META[k].label.toLowerCase()).join(' and ');
    return (
      <Link href="/calls" className="flex items-center gap-3 rounded-2xl border border-brand/25 bg-brand-light p-4">
        <span className="text-2xl" aria-hidden>📅</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-brand-dark">Book your calls for the week of {week}</span>
          <span className="block text-2xs text-brand-dark/70">Still to book: your {items}.</span>
        </span>
        <span className="text-xs font-semibold text-brand-dark">Choose times →</span>
      </Link>
    );
  }
  return null;
}
