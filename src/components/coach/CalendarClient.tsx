'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addDays, coachToday } from '@/lib/date';
import type { CoachAvailabilityRow, CoachCallRow } from '@/lib/supabase/database.types';
import { CALL_MINUTES, KIND_META, dayLabel, maltaParts, weekRangeUtc, weekStartOf, weekdayOf } from '@/lib/calls';
import { AvailabilitySheet, CallSheet, SyncSheet, personKeyOf, type CallDraft, type Person } from './CalendarSheets';

const ROW = 56; // px per hour in the grid
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const pad = (n: number) => String(n).padStart(2, '0');

export default function CalendarClient() {
  const [supabase] = useState(() => createClient());
  const [today] = useState(() => coachToday());
  const [monday, setMonday] = useState(() => weekStartOf(coachToday()));
  const [selected, setSelected] = useState(() => coachToday()); // the day shown on a phone
  const [people, setPeople] = useState<Person[]>([]);
  const [calls, setCalls] = useState<CoachCallRow[]>([]);
  const [availability, setAvailability] = useState<CoachAvailabilityRow[]>([]);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState<CallDraft | null>(null);
  const [showAvail, setShowAvail] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [nowMin, setNowMin] = useState<number | null>(null);

  // People, availability and the feed token: once, and again after availability changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prof, contacts, avail, feed] = await Promise.all([
          supabase.from('profiles').select('id, full_name, email, archived_at').eq('role', 'client').order('full_name'),
          // Only people who get weekly calls: 1-1 coaching and 8-Week Challenge members without an app login (not meal-plan buyers).
          supabase.from('crm_contacts').select('id, full_name').eq('stage', 'won').in('package', ['3_months', '6_months', '12_months', '8_week_challenge']).is('client_id', null).order('full_name'),
          supabase.from('coach_availability').select('*').order('weekday').order('start_time'),
          supabase.from('coach_calendar_feed').select('token').eq('id', 1).maybeSingle(),
        ]);
        if (cancelled) return;
        const firstError = prof.error || contacts.error || avail.error;
        if (firstError) throw firstError;
        setPeople([
          ...(prof.data || []).map((p): Person => ({ key: `c:${p.id}`, id: p.id, type: 'client', name: p.full_name || p.email, active: !p.archived_at })),
          ...(contacts.data || []).map((c): Person => ({ key: `k:${c.id}`, id: c.id, type: 'contact', name: c.full_name, active: true })),
        ]);
        setAvailability(avail.data || []);
        setToken(feed.data?.token ?? '');
      } catch {
        if (!cancelled) setError("Couldn't load your clients and hours — check your connection and refresh.");
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, version]);

  // The visible week's calls.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { from, to } = weekRangeUtc(monday);
      const { data, error: err } = await supabase.from('coach_calls').select('*').gte('starts_at', from).lt('starts_at', to).order('starts_at');
      if (cancelled) return;
      if (err) setError("Couldn't load this week's calls — check your connection and try again.");
      else { setCalls(data || []); setError(null); }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase, monday, version]);

  // Time-of-day marker for today's column; refreshed each minute.
  useEffect(() => {
    const tick = () => setNowMin(maltaParts(new Date()).minutes);
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  const goWeek = (m: string, day?: string) => { setLoading(true); setMonday(m); setSelected(day ?? m); };
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const live = useMemo(() => calls.filter((c) => c.status !== 'cancelled'), [calls]);
  const nameOf = (c: CoachCallRow) => people.find((p) => p.key === personKeyOf(c))?.name ?? 'Client';

  // Hour range: 07:00–21:00, widened to fit availability and any call outside it.
  const { startH, endH } = useMemo(() => {
    let lo = 7 * 60, hi = 21 * 60;
    for (const a of availability) { lo = Math.min(lo, toMin(a.start_time)); hi = Math.max(hi, toMin(a.end_time)); }
    for (const c of live) {
      const p = maltaParts(c.starts_at);
      lo = Math.min(lo, p.minutes); hi = Math.max(hi, p.minutes + c.duration_min);
    }
    return { startH: Math.floor(lo / 60), endH: Math.ceil(hi / 60) };
  }, [availability, live]);
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);

  const countable = live.filter((c) => c.status !== 'no_show');
  const activePeople = people.filter((p) => p.active);
  const booked = activePeople.reduce((n, p) => n + (['check_in', 'info'] as const).filter((k) => countable.some((c) => personKeyOf(c) === p.key && c.kind === k)).length, 0);
  const needed = activePeople.length * 2;

  const rows = [...activePeople].sort((a, b) => {
    const miss = (p: Person) => (['check_in', 'info'] as const).filter((k) => !countable.some((c) => personKeyOf(c) === p.key && c.kind === k)).length;
    return miss(b) - miss(a) || a.name.localeCompare(b.name);
  });

  const defaultDate = days.includes(today) ? today : days.includes(selected) ? selected : monday;
  const openNew = (patch: Partial<CallDraft> = {}) => setDraft({ date: defaultDate, time: '10:00', ...patch });
  const saved = () => { setDraft(null); setShowAvail(false); setLoading(true); setVersion((v) => v + 1); };

  const weekLabel = `${dayLabel(monday, { day: 'numeric', month: 'short' })} – ${dayLabel(addDays(monday, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;

  function slotClick(date: string, e: React.MouseEvent<HTMLDivElement>) {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const mins = Math.min(Math.round(((startH * 60) + (y / ROW) * 60) / 30) * 30, 23 * 60);
    openNew({ date, time: `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}` });
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 page-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-h1 font-semibold">Calendar</h1>
          <p className="text-2xs text-neutral-400">Check-in and info calls · one hour each · Malta time</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSync(true)} className="rounded-full border border-border px-3 py-2 text-xs font-medium text-neutral-600 hover:border-neutral-300">Google Calendar</button>
          <button onClick={() => setShowAvail(true)} className="rounded-full border border-border px-3 py-2 text-xs font-medium text-neutral-600 hover:border-neutral-300">My hours</button>
          <button onClick={() => openNew()} className="rounded-full bg-brand text-white px-4 py-2 text-xs font-semibold">＋ Book call</button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => goWeek(addDays(monday, -7))} aria-label="Previous week" className="w-10 h-10 rounded-full border border-border text-neutral-500 hover:border-neutral-300">‹</button>
        <button onClick={() => goWeek(addDays(monday, 7))} aria-label="Next week" className="w-10 h-10 rounded-full border border-border text-neutral-500 hover:border-neutral-300">›</button>
        <p className="text-sm font-medium ml-1">{weekLabel}</p>
        {monday !== weekStartOf(today) && <button onClick={() => goWeek(weekStartOf(today), today)} className="ml-auto text-xs text-brand-dark font-medium px-2 py-2">This week</button>}
      </div>

      {error && <div className="mb-3 rounded-xl bg-status-bad-bg text-status-bad-text text-sm px-4 py-3" role="alert">{error}</div>}

      {/* Who still needs a call this week */}
      <section className="rounded-2xl border border-border bg-surface p-4 mb-4" aria-label="Calls this week">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-sm font-semibold">This week&rsquo;s calls</p>
          <p className="text-2xs text-neutral-400">{needed > 0 ? `${booked} of ${needed} booked` : 'No clients yet'}</p>
        </div>
        {needed > 0 && (
          <div className="h-1.5 rounded-full bg-neutral-100 mb-3 overflow-hidden"><div className="h-full bg-brand transition-all" style={{ width: `${Math.round((booked / needed) * 100)}%` }} /></div>
        )}
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((p) => (
            <li key={p.key} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
              <span className="flex-1 min-w-0 text-sm truncate">{p.name}</span>
              {(['check_in', 'info'] as const).map((k) => {
                const c = countable.find((x) => personKeyOf(x) === p.key && x.kind === k);
                if (c) {
                  const when = maltaParts(c.starts_at);
                  return (
                    <button key={k} onClick={() => setDraft({ call: c, personKey: p.key, kind: k, date: when.date, time: when.time })}
                      className={`rounded-full border px-2.5 py-1.5 text-2xs font-medium whitespace-nowrap ${KIND_META[k].chip}`}>
                      {c.status === 'done' ? '✓ ' : ''}{KIND_META[k].label} · {dayLabel(when.date, { weekday: 'short' })} {when.time}
                    </button>
                  );
                }
                return (
                  <button key={k} onClick={() => openNew({ personKey: p.key, kind: k })}
                    className="rounded-full border border-dashed border-neutral-300 px-2.5 py-1.5 text-2xs font-medium text-neutral-400 hover:text-neutral-700 hover:border-neutral-400 whitespace-nowrap">
                    ＋ {KIND_META[k].label}
                  </button>
                );
              })}
            </li>
          ))}
          {rows.length === 0 && !loading && <li className="text-sm text-neutral-400 py-1">Add clients first — they&rsquo;ll show up here.</li>}
        </ul>
      </section>

      {/* Phone: pick a day */}
      <div className="sm:hidden flex gap-1 mb-2 overflow-x-auto" role="tablist" aria-label="Day">
        {days.map((d) => (
          <button key={d} role="tab" aria-selected={selected === d} onClick={() => setSelected(d)}
            className={`flex-1 min-w-[44px] rounded-xl py-2 text-center ${selected === d ? 'bg-brand text-white' : 'border border-border text-neutral-500'}`}>
            <span className="block text-3xs uppercase">{dayLabel(d, { weekday: 'short' })}</span>
            <span className="block text-sm font-semibold">{Number(d.slice(8))}</span>
          </button>
        ))}
      </div>

      {/* Week grid */}
      <div className={`rounded-2xl border border-border bg-surface overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <div className="grid grid-cols-[40px_minmax(0,1fr)] sm:grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-border">
          <div />
          {days.map((d) => (
            <div key={d} className={`${selected === d ? 'block' : 'hidden sm:block'} py-2 text-center border-l border-border ${d === today ? 'bg-brand-light' : ''}`}>
              <p className="text-3xs uppercase text-neutral-400">{dayLabel(d, { weekday: 'short' })}</p>
              <p className={`text-sm font-semibold ${d === today ? 'text-brand-dark' : ''}`}>{Number(d.slice(8))}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[40px_minmax(0,1fr)] sm:grid-cols-[48px_repeat(7,minmax(0,1fr))]">
          <div className="relative" style={{ height: hours.length * ROW }}>
            {hours.map((h, i) => <span key={h} className="absolute right-1.5 text-3xs text-neutral-400 -translate-y-1/2" style={{ top: i * ROW, display: i === 0 ? 'none' : undefined }}>{pad(h)}:00</span>)}
          </div>
          {days.map((d) => {
            const wd = weekdayOf(d);
            const dayCalls = live.filter((c) => maltaParts(c.starts_at).date === d);
            return (
              <div key={d} onClick={(e) => slotClick(d, e)} role="button" tabIndex={-1} aria-label={`Book a call on ${dayLabel(d)}`}
                className={`${selected === d ? 'block' : 'hidden sm:block'} relative border-l border-border cursor-pointer`} style={{ height: hours.length * ROW }}>
                {availability.filter((a) => a.weekday === wd).map((a) => (
                  <div key={a.id} className="absolute inset-x-0 bg-brand/[0.07]" style={{ top: ((toMin(a.start_time) - startH * 60) / 60) * ROW, height: ((toMin(a.end_time) - toMin(a.start_time)) / 60) * ROW }} />
                ))}
                {hours.map((h, i) => i > 0 && <div key={h} className="absolute inset-x-0 border-t border-border/70" style={{ top: i * ROW }} />)}
                {d === today && nowMin !== null && nowMin >= startH * 60 && nowMin <= endH * 60 && (
                  <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: ((nowMin - startH * 60) / 60) * ROW }}>
                    <div className="h-px bg-ibf-red" /><div className="w-2 h-2 rounded-full bg-ibf-red -mt-[5px] -ml-1" />
                  </div>
                )}
                {dayCalls.map((c) => {
                  const p = maltaParts(c.starts_at);
                  const meta = KIND_META[c.kind];
                  return (
                    <button key={c.id} onClick={(e) => { e.stopPropagation(); setDraft({ call: c, personKey: personKeyOf(c), kind: c.kind, date: p.date, time: p.time }); }}
                      className={`absolute left-0.5 right-0.5 z-[5] rounded-lg border-l-4 px-1.5 py-1 text-left overflow-hidden ${meta.block} ${c.status === 'done' ? 'opacity-60' : ''} ${c.status === 'no_show' ? 'opacity-50 line-through' : ''}`}
                      style={{ top: ((p.minutes - startH * 60) / 60) * ROW + 1, height: (c.duration_min / 60) * ROW - 2 }}>
                      <span className="block text-2xs font-semibold leading-tight truncate">{c.status === 'done' ? '✓ ' : ''}{nameOf(c)}</span>
                      <span className="block text-3xs leading-tight truncate opacity-80">{meta.label} · {p.time}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-2xs text-neutral-400 mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: KIND_META.check_in.dot }} />Check-in</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: KIND_META.info.dot }} />Info call</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle bg-brand/15" />Your available hours</span>
        <span>Tap an empty slot to book it · {CALL_MINUTES} min each</span>
      </p>

      {draft && (
        <CallSheet key={draft.call?.id ?? `${draft.date}${draft.time}${draft.personKey ?? ''}${draft.kind ?? ''}`}
          people={people} weekCalls={live.filter((c) => c.status === 'scheduled' || c.status === 'done')} availability={availability}
          initial={draft} onClose={() => setDraft(null)} onSaved={saved} />
      )}
      {showAvail && <AvailabilitySheet availability={availability} onClose={() => setShowAvail(false)} onSaved={saved} />}
      {showSync && token && <SyncSheet token={token} onClose={() => setShowSync(false)} onRotated={(t) => setToken(t)} />}
    </div>
  );
}

