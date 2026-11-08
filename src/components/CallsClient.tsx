'use client';

import { useEffect, useState } from 'react';
import { KIND_META, dayLabel, maltaParts, maltaToUtc } from '@/lib/calls';
import { addDays } from '@/lib/date';

type Kind = 'check_in' | 'info';
type Mine = { id: string; kind: Kind; starts_at: string; duration_min: number };
type Week = { monday: string; open: boolean; opensAt: string | null; slots: Record<string, string[]> | null; mine: Mine[] };
type Data = { enabled: boolean; weeks: Week[] };

const KINDS: { kind: Kind; title: string; blurb: string; emoji: string }[] = [
  { kind: 'check_in', title: 'Check-in call', blurb: 'Your weekly catch-up: how it’s going and what’s next.', emoji: '✅' },
  { kind: 'info', title: 'Info call', blurb: 'We go through the next part of the Vitality course.', emoji: '📖' },
];

const longDay = (date: string) => dayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' });
const range = (monday: string) => `${dayLabel(monday, { day: 'numeric', month: 'short' })} – ${dayLabel(addDays(monday, 6), { day: 'numeric', month: 'short' })}`;

// The client's booking screen: two calls a week (a check-in and an info call),
// picked from the coach's free times. Next week opens on the day the coach sets.
export default function CallsClient() {
  const [data, setData] = useState<Data | null>(null);
  // "Now" as of the last load, so what counts as already-happened isn't recomputed during render.
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [weekIdx, setWeekIdx] = useState(0);
  const [picking, setPicking] = useState<{ kind: Kind; replaceId?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/booking/slots', { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setError(body.error || 'Couldn’t load the times — please try again.'); return; }
        setData(body as Data); setLoadedAt(Date.now()); setError(null);
      } catch {
        if (!cancelled) setError('Couldn’t load the times — check your connection and try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [version]);

  const refresh = () => setVersion((v) => v + 1);
  const week = data?.weeks[weekIdx];
  const hasFreeTimes = Object.values(week?.slots ?? {}).some((t) => t.length > 0);

  async function cancelCall(c: Mine) {
    const when = maltaParts(c.starts_at);
    if (!window.confirm(`Cancel your ${KIND_META[c.kind].label.toLowerCase()} on ${longDay(when.date)} at ${when.time}?`)) return;
    setBusyId(c.id); setNotice(null);
    try {
      const res = await fetch('/api/booking/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error || 'Couldn’t cancel — please try again.');
      else { setError(null); setNotice('Call cancelled. You can book another time.'); }
    } catch {
      setError('Couldn’t cancel — check your connection and try again.');
    }
    setBusyId(null);
    refresh();
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 page-fade-in">
      <h1 className="text-h1 font-semibold">Your calls</h1>
      <p className="text-sm text-neutral-500 mt-1">Two calls a week with Francesco: a check-in and an info call. Pick the times that suit you. All times are Malta time.</p>

      {data && (
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-neutral-100 p-1" role="tablist" aria-label="Week">
          {data.weeks.map((w, i) => (
            <button key={w.monday} role="tab" aria-selected={weekIdx === i} onClick={() => { setWeekIdx(i); setNotice(null); }}
              className={`rounded-xl px-2 py-2 text-center text-sm font-medium ${weekIdx === i ? 'bg-surface text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-neutral-500'}`}>
              {i === 0 ? 'This week' : 'Next week'}
              <span className="block text-3xs font-normal text-neutral-400">{range(w.monday)}{!w.open && ' · 🔒'}</span>
            </button>
          ))}
        </div>
      )}

      {notice && <div className="mt-3 rounded-xl bg-status-good-bg text-status-good-text text-sm px-4 py-3" role="status">{notice}</div>}
      {error && <div className="mt-3 rounded-xl bg-status-bad-bg text-status-bad-text text-sm px-4 py-3" role="alert">{error}</div>}

      {!data && !error && <div className="mt-4 h-40 rounded-2xl bg-neutral-100 animate-pulse" />}

      {data && !data.enabled && (
        <p className="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm text-neutral-600">Booking is switched off for now — message Francesco to arrange a call.</p>
      )}

      {data && data.enabled && week && !week.open && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-5 text-center">
          <p className="text-2xl" aria-hidden>🔒</p>
          <p className="mt-1 text-sm font-semibold">Booking for next week isn’t open yet</p>
          {week.opensAt && <p className="text-sm text-neutral-500">It opens {opensLabel(week.opensAt)}.</p>}
        </div>
      )}

      {data && data.enabled && week?.open && (
        <div className="mt-4 flex flex-col gap-3">
          {KINDS.map(({ kind, title, blurb, emoji }) => {
            const c = week.mine.find((m) => m.kind === kind);
            const when = c ? maltaParts(c.starts_at) : null;
            const past = c ? new Date(c.starts_at).getTime() <= loadedAt : false;
            return (
              <section key={kind} className={`rounded-2xl border p-4 ${c ? KIND_META[kind].chip : 'border-border bg-surface'}`} aria-label={title}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl" aria-hidden>{emoji}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold leading-tight">{title}</h2>
                    <p className="text-sm text-neutral-600">{blurb}</p>
                    {c && when ? (
                      <p className="mt-2 text-sm font-semibold">✓ {longDay(when.date)}, {when.time}–{maltaParts(new Date(new Date(c.starts_at).getTime() + c.duration_min * 60000)).time}</p>
                    ) : (
                      <p className="mt-2 text-sm text-neutral-500">Not booked yet</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {!c && hasFreeTimes && <button onClick={() => { setNotice(null); setPicking({ kind }); }} className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white active:scale-[0.98]">Choose a time</button>}
                  {c && !past && (
                    <>
                      <button onClick={() => { setNotice(null); setPicking({ kind, replaceId: c.id }); }} className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-neutral-700 active:scale-[0.98]">Change time</button>
                      <button onClick={() => cancelCall(c)} disabled={busyId === c.id} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-neutral-500 disabled:opacity-50">{busyId === c.id ? '…' : 'Cancel'}</button>
                    </>
                  )}
                  {c && past && <p className="text-xs text-neutral-500">This call has already happened.</p>}
                </div>
              </section>
            );
          })}
          {!hasFreeTimes && week.mine.length < 2 && (
            <p className="rounded-xl bg-neutral-50 border border-border px-4 py-3 text-sm text-neutral-600">There are no free times left this week — message Francesco and he’ll sort something out.</p>
          )}
        </div>
      )}

      {picking && week?.slots && (
        <TimePicker
          kind={picking.kind} replaceId={picking.replaceId} slots={week.slots}
          onClose={() => setPicking(null)}
          onBooked={(msg) => { setPicking(null); setError(null); setNotice(msg); refresh(); }}
          onStale={refresh}
        />
      )}
    </div>
  );
}

function opensLabel(iso: string): string {
  const p = maltaParts(iso);
  return `${dayLabel(p.date, { weekday: 'long', day: 'numeric', month: 'long' })} at ${p.time}`;
}

function TimePicker({ kind, replaceId, slots, onClose, onBooked, onStale }: {
  kind: Kind; replaceId?: string; slots: Record<string, string[]>;
  onClose: () => void; onBooked: (msg: string) => void; onStale: () => void;
}) {
  const days = Object.keys(slots).filter((d) => slots[d].length > 0);
  const [day, setDay] = useState(days[0] ?? '');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const times = slots[day] ?? [];

  async function confirm() {
    if (!day || !time || busy) return;
    setBusy(true); setError(null);
    try {
      // Malta wall-clock → the exact instant, using the same helper the server uses.
      const res = await fetch('/api/booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, starts_at: maltaToUtc(day, time).toISOString(), replaceId }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Couldn’t book that — please try again.');
        if (res.status === 409) { setTime(''); onStale(); }
        setBusy(false);
        return;
      }
      onBooked(`Booked ✓ ${KIND_META[kind].label} on ${longDay(day)} at ${time}. You’ll see a reminder here the day before.`);
    } catch {
      setError('Couldn’t book that — check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-surface rounded-3xl p-5 w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className="text-base font-semibold">{replaceId ? 'Change' : 'Choose a time for'} your {KIND_META[kind].label.toLowerCase()}</p>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 -mt-1 rounded-full text-neutral-400 hover:bg-neutral-100 text-lg">✕</button>
        </div>
        <p className="text-xs text-neutral-400 mb-4">One hour · Malta time</p>

        {days.length === 0 ? (
          <p className="text-sm text-neutral-600">There are no free times left. Message Francesco and he’ll sort something out.</p>
        ) : (
          <>
            <p className="text-xs font-medium text-neutral-500 mb-1.5">Day</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Day">
              {days.map((d) => (
                <button key={d} role="tab" aria-selected={day === d} onClick={() => { setDay(d); setTime(''); }}
                  className={`flex-shrink-0 rounded-xl px-3.5 py-2 text-center ${day === d ? 'bg-brand text-white' : 'border border-border text-neutral-600'}`}>
                  <span className="block text-3xs uppercase">{dayLabel(d, { weekday: 'short' })}</span>
                  <span className="block text-sm font-semibold">{dayLabel(d, { day: 'numeric', month: 'short' })}</span>
                </button>
              ))}
            </div>
            <p className="text-xs font-medium text-neutral-500 mt-4 mb-1.5">Time</p>
            <div className="grid grid-cols-3 gap-2">
              {times.map((t) => (
                <button key={t} onClick={() => setTime(t)} aria-pressed={time === t}
                  className={`rounded-xl border py-3 text-sm font-semibold ${time === t ? 'border-brand bg-brand text-white' : 'border-border text-neutral-700 hover:border-neutral-300'}`}>{t}</button>
              ))}
            </div>
          </>
        )}

        {error && <p className="mt-3 text-sm text-status-bad-text" role="alert">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-neutral-600">Cancel</button>
          <button onClick={confirm} disabled={!time || busy} className="flex-[1.6] rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? 'Booking…' : time ? `Book ${dayLabel(day, { weekday: 'short' })} ${time}` : 'Pick a time'}
          </button>
        </div>
      </div>
    </div>
  );
}
