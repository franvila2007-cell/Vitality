'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CoachAvailabilityRow, CoachCallKind, CoachCallRow } from '@/lib/supabase/database.types';
import { CALL_MINUTES, KIND_META, callEnd, dayLabel, googleCalendarUrl, maltaParts, maltaToUtc, timeRangeLabel, weekRangeUtc, weekStartOf, weekdayOf } from '@/lib/calls';

export type Person = { key: string; id: string; type: 'client' | 'contact'; name: string; active: boolean; /** shown beside the name, e.g. 8-Week Challenge */ tag?: string };
export const personKeyOf = (c: Pick<CoachCallRow, 'client_id' | 'contact_id'>) => (c.client_id ? `c:${c.client_id}` : `k:${c.contact_id}`);

const field = 'rounded-xl border border-border bg-neutral-50 px-3 py-2.5 text-base outline-none focus:border-brand focus:bg-white transition-colors w-full';

export function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-surface rounded-3xl p-5 w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className="text-base font-semibold">{title}</p>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 -mt-1 rounded-full text-neutral-400 hover:bg-neutral-100 text-lg">✕</button>
        </div>
        {subtitle && <p className="text-xs text-neutral-400 mb-4">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

// ── Book / edit a call ────────────────────────────────────────────────────

export type CallDraft = { call?: CoachCallRow; personKey?: string; kind?: CoachCallKind; date: string; time: string };

export function CallSheet({ people, weekCalls, availability, initial, onClose, onSaved }: {
  people: Person[];
  /** Non-cancelled calls in the week being viewed (used for the weekly-rule and overlap hints). */
  weekCalls: CoachCallRow[];
  availability: CoachAvailabilityRow[];
  initial: CallDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [supabase] = useState(() => createClient());
  const editing = initial.call;
  const [personKey, setPersonKey] = useState(initial.personKey ?? '');
  const [kind, setKind] = useState<CoachCallKind>(initial.kind ?? 'check_in');
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [note, setNote] = useState(editing?.note ?? '');
  const [status, setStatus] = useState(editing?.status ?? 'scheduled');
  const [calls, setCalls] = useState(weekCalls);
  const [loadedWeek, setLoadedWeek] = useState(weekStartOf(initial.date));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (c: CoachCallRow) => people.find((p) => p.key === personKeyOf(c))?.name ?? 'Client';

  // The weekly-rule hints need the calls of whatever week the date lands in.
  async function loadWeekFor(d: string) {
    const wk = weekStartOf(d);
    if (wk === loadedWeek) return;
    setLoadedWeek(wk);
    const { from, to } = weekRangeUtc(wk);
    const { data } = await supabase.from('coach_calls').select('*').in('status', ['scheduled', 'done']).gte('starts_at', from).lt('starts_at', to);
    setCalls(data || []);
  }

  function pickPerson(key: string) {
    setPersonKey(key);
    if (editing || !key) return;
    // Suggest the call this person is still missing this week.
    const mine = calls.filter((c) => personKeyOf(c) === key);
    if (!mine.some((c) => c.kind === 'check_in')) setKind('check_in');
    else if (!mine.some((c) => c.kind === 'info')) setKind('info');
  }

  const startMs = date && time ? maltaToUtc(date, time).getTime() : NaN;
  const endMs = startMs + CALL_MINUTES * 60000;
  const hints: string[] = [];
  if (personKey) {
    const dup = calls.find((c) => c.id !== editing?.id && personKeyOf(c) === personKey && c.kind === kind);
    if (dup) hints.push(`${nameOf(dup)} already has a ${KIND_META[kind].label.toLowerCase()} this week (${dayLabel(maltaParts(dup.starts_at).date)}, ${maltaParts(dup.starts_at).time}). You can still book another.`);
  }
  if (Number.isFinite(startMs)) {
    const clash = calls.find((c) => c.id !== editing?.id && new Date(c.starts_at).getTime() < endMs && callEnd(c).getTime() > startMs);
    if (clash) hints.push(`This overlaps ${nameOf(clash)}'s ${KIND_META[clash.kind].label.toLowerCase()} (${timeRangeLabel(clash)}).`);
    const wd = weekdayOf(date);
    const mins = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const inside = availability.some((a) => a.weekday === wd && toMin(a.start_time) <= mins && toMin(a.end_time) >= mins + CALL_MINUTES);
    if (!inside) hints.push("That's outside your available hours.");
  }

  async function save(nextStatus?: 'cancelled') {
    if (saving) return;
    if (!personKey) { setError('Choose who the call is with.'); return; }
    if (!date || !time) { setError('Pick a date and time.'); return; }
    const person = people.find((p) => p.key === personKey);
    const row = {
      client_id: person?.type === 'client' ? person.id : (editing?.client_id ?? null),
      contact_id: person?.type === 'contact' ? person.id : (editing?.contact_id ?? null),
      kind, starts_at: maltaToUtc(date, time).toISOString(), duration_min: CALL_MINUTES, note: note.trim(), status: nextStatus ?? status,
    };
    // A person never has both ids; keep the one that matches the chosen person.
    if (person?.type === 'client') row.contact_id = null;
    if (person?.type === 'contact') row.client_id = null;
    setSaving(true); setError(null);
    const res = editing
      ? await supabase.from('coach_calls').update({ ...row, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : await supabase.from('coach_calls').insert(row);
    if (res.error) { setError("Couldn't save that — check your connection and try again."); setSaving(false); return; }
    onSaved();
  }

  async function remove() {
    if (!editing || saving) return;
    if (!window.confirm('Delete this call? (Use Cancel call to keep a record.)')) return;
    setSaving(true); setError(null);
    const { error: err } = await supabase.from('coach_calls').delete().eq('id', editing.id);
    if (err) { setError("Couldn't delete that — try again."); setSaving(false); return; }
    onSaved();
  }

  const active = people.filter((p) => p.active || p.key === personKey);
  const clients = active.filter((p) => p.type === 'client');
  const contacts = active.filter((p) => p.type === 'contact');
  const person = people.find((p) => p.key === personKey);
  const gcalCall = editing && person ? googleCalendarUrl({ ...editing, kind, starts_at: maltaToUtc(date, time).toISOString(), note }, person.name) : null;

  return (
    <Sheet title={editing ? 'Edit call' : 'Book a call'} subtitle={editing?.booked_by === 'client' ? 'Booked by the client themselves in the app. Every call is one hour, Malta time.' : 'Every call is one hour, Malta time.'} onClose={onClose}>
      <label className="block text-xs font-medium text-neutral-500 mb-1.5">Who is it with?</label>
      <select value={personKey} onChange={(e) => pickPerson(e.target.value)} className={field}>
        <option value="">Choose a client…</option>
        {clients.length > 0 && <optgroup label="Clients">{clients.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</optgroup>}
        {contacts.length > 0 && <optgroup label="8-Week Challenge & other CRM contacts">{contacts.map((p) => <option key={p.key} value={p.key}>{p.name}{p.tag ? ` · ${p.tag}` : ''}</option>)}</optgroup>}
      </select>

      <div className="grid grid-cols-2 gap-2 mt-4">
        {(['check_in', 'info'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
            className={`rounded-xl border px-3 py-2.5 text-sm font-medium text-left ${kind === k ? KIND_META[k].chip + ' border-2' : 'border-border text-neutral-500'}`}>
            <span className="block">{KIND_META[k].label}</span>
            <span className="block text-3xs font-normal opacity-70">{k === 'check_in' ? 'Weekly progress catch-up' : 'Vitality course'}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">Date</span>
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (e.target.value) void loadWeekFor(e.target.value); }} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">Start time</span>
          <input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className={field} />
        </label>
      </div>
      {Number.isFinite(startMs) && <p className="text-2xs text-neutral-400 mt-1.5">{dayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })}, {time}–{maltaParts(new Date(endMs)).time}</p>}

      {hints.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {hints.map((h) => <li key={h} className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">{h}</li>)}
        </ul>
      )}

      <label className="block text-xs font-medium text-neutral-500 mt-4 mb-1.5">Note (optional)</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Module 3 — sleep & recovery" className={`${field} resize-none`} />

      {editing && (
        <div className="mt-4">
          <p className="text-xs font-medium text-neutral-500 mb-1.5">Status</p>
          <div className="grid grid-cols-3 gap-1.5">
            {([['scheduled', 'Scheduled'], ['done', 'Done ✓'], ['no_show', 'No-show']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setStatus(k)} aria-pressed={status === k}
                className={`rounded-lg border py-2 text-xs font-medium ${status === k ? 'border-brand bg-brand-light text-brand-dark' : 'border-border text-neutral-500'}`}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-status-bad-text mt-3" role="alert">{error}</p>}

      <div className="flex gap-2 mt-5">
        <button onClick={onClose} className="flex-1 rounded-xl border border-border text-neutral-600 py-3 text-sm font-medium">Close</button>
        <button onClick={() => save()} disabled={saving} className="flex-[1.4] rounded-xl bg-brand text-white py-3 text-sm font-semibold disabled:opacity-50">
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Book call'}
        </button>
      </div>
      {editing && (
        <div className="flex items-center justify-between mt-3 text-xs">
          {gcalCall && <a href={gcalCall} target="_blank" rel="noreferrer" className="text-brand-dark font-medium py-1.5">＋ Add to Google Calendar</a>}
          <span className="flex gap-3 ml-auto">
            <button onClick={() => save('cancelled')} className="text-neutral-500 py-1.5">Cancel call</button>
            <button onClick={remove} className="text-status-bad-text py-1.5">Delete</button>
          </span>
        </div>
      )}
    </Sheet>
  );
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ── Weekly availability ───────────────────────────────────────────────────

type Win = { start: string; end: string };

export function AvailabilitySheet({ availability, onClose, onSaved }: { availability: CoachAvailabilityRow[]; onClose: () => void; onSaved: () => void }) {
  const [supabase] = useState(() => createClient());
  const [days, setDays] = useState<Record<number, Win[]>>(() => {
    const out: Record<number, Win[]> = {};
    for (let d = 1; d <= 7; d++) out[d] = availability.filter((a) => a.weekday === d).map((a) => ({ start: a.start_time.slice(0, 5), end: a.end_time.slice(0, 5) }));
    return out;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setWin = (d: number, i: number, patch: Partial<Win>) => setDays((s) => ({ ...s, [d]: s[d].map((w, j) => (j === i ? { ...w, ...patch } : w)) }));

  async function save() {
    if (saving) return;
    for (let d = 1; d <= 7; d++) for (const w of days[d]) if (!w.start || !w.end || toMin(w.end) <= toMin(w.start)) { setError(`${WEEKDAYS[d - 1]}: the end time has to be after the start.`); return; }
    setSaving(true); setError(null);
    const rows = Object.entries(days).flatMap(([d, ws]) => ws.map((w) => ({ weekday: Number(d), start_time: w.start, end_time: w.end })));
    // Add the new hours first, then drop the old rows — a failure part-way never leaves you with no availability.
    if (rows.length > 0) {
      const ins = await supabase.from('coach_availability').insert(rows);
      if (ins.error) { setError("Couldn't save your hours — try again."); setSaving(false); return; }
    }
    const oldIds = availability.map((a) => a.id);
    if (oldIds.length > 0) {
      const del = await supabase.from('coach_availability').delete().in('id', oldIds);
      if (del.error) { setError("Saved, but the old hours couldn't be cleared — open this again and save once more."); setSaving(false); return; }
    }
    onSaved();
  }

  return (
    <Sheet title="Your available hours" subtitle="Shown as the green bands on the calendar — calls can still go outside them." onClose={onClose}>
      <div className="flex flex-col gap-3">
        {WEEKDAYS.map((name, idx) => {
          const d = idx + 1;
          return (
            <div key={name} className="border-b border-border pb-3 last:border-0">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium">{name}</p>
                <button onClick={() => setDays((s) => ({ ...s, [d]: [...s[d], { start: '09:00', end: '17:00' }] }))} className="text-xs text-brand-dark font-medium py-1">＋ Add hours</button>
              </div>
              {days[d].length === 0 && <p className="text-xs text-neutral-400">Not available</p>}
              {days[d].map((w, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <input type="time" step={900} value={w.start} onChange={(e) => setWin(d, i, { start: e.target.value })} aria-label={`${name} start`} className={`${field} py-2`} />
                  <span className="text-neutral-400">–</span>
                  <input type="time" step={900} value={w.end} onChange={(e) => setWin(d, i, { end: e.target.value })} aria-label={`${name} end`} className={`${field} py-2`} />
                  <button onClick={() => setDays((s) => ({ ...s, [d]: s[d].filter((_, j) => j !== i) }))} aria-label={`Remove ${name} hours`} className="w-9 h-9 flex-shrink-0 rounded-full text-neutral-400 hover:bg-neutral-100">✕</button>
                </div>
              ))}
              {d === 1 && days[1].length > 0 && (
                <button onClick={() => setDays((s) => ({ ...s, 2: [...s[1]], 3: [...s[1]], 4: [...s[1]], 5: [...s[1]] }))} className="text-2xs text-neutral-400 underline py-1">Use Monday&rsquo;s hours for Tue–Fri</button>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="text-sm text-status-bad-text mt-3" role="alert">{error}</p>}
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 rounded-xl border border-border text-neutral-600 py-3 text-sm font-medium">Cancel</button>
        <button onClick={save} disabled={saving} className="flex-[1.4] rounded-xl bg-brand text-white py-3 text-sm font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save hours'}</button>
      </div>
    </Sheet>
  );
}

// ── Google Calendar sync ──────────────────────────────────────────────────

export function SyncSheet({ token, onClose, onRotated }: { token: string; onClose: () => void; onRotated: (t: string) => void }) {
  const [supabase] = useState(() => createClient());
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `${typeof window === 'undefined' ? '' : window.location.origin}/api/calendar/${token}/vitality.ics`;

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError('Couldn’t copy automatically — select the link and copy it.'); }
  }

  async function rotate() {
    if (!window.confirm('Make a new link? The old one stops working, so you’d need to subscribe again in Google Calendar.')) return;
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const next = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const { error: err } = await supabase.from('coach_calendar_feed').update({ token: next }).eq('id', 1);
    if (err) { setError("Couldn't make a new link — try again."); return; }
    onRotated(next);
  }

  return (
    <Sheet title="Send calls to Google Calendar" subtitle="Your Vitality calls appear in Google Calendar, labelled with each client." onClose={onClose}>
      <p className="text-xs font-medium text-neutral-500 mb-1.5">Your private calendar link</p>
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${field} text-xs`} />
      <button onClick={copy} className="mt-2 w-full rounded-xl bg-brand text-white py-2.5 text-sm font-semibold">{copied ? 'Copied ✓' : 'Copy link'}</button>
      {error && <p className="text-sm text-status-bad-text mt-2" role="alert">{error}</p>}

      <ol className="mt-4 text-sm text-neutral-600 list-decimal pl-5 flex flex-col gap-1.5">
        <li>On a computer, open <span className="font-medium">calendar.google.com</span>.</li>
        <li>Next to <span className="font-medium">Other calendars</span> (left side) press <span className="font-medium">+</span> → <span className="font-medium">From URL</span>.</li>
        <li>Paste the link and press <span className="font-medium">Add calendar</span>. It then shows on your phone too.</li>
      </ol>
      <div className="mt-4 rounded-xl bg-neutral-50 border border-border p-3 text-xs text-neutral-500 leading-relaxed">
        Google refreshes linked calendars every few hours, so a brand-new booking can take a while to show up. For something instant, open the call and tap <span className="font-medium">＋ Add to Google Calendar</span>.
        Anyone with this link can see your call times and client names — keep it private.
      </div>
      <button onClick={rotate} className="mt-3 text-xs text-neutral-400 underline py-1">Make a new link (stops the old one)</button>
    </Sheet>
  );
}

// ── Client booking: on/off, when next week opens, and the Google link ────────

type GoogleStatus = { connected: boolean; links: number; events: number; allDay: number; errors: string[] };
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function BookingSheet({ onClose }: { onClose: () => void }) {
  const [supabase] = useState(() => createClient());
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [weekday, setWeekday] = useState(5);
  const [openTime, setOpenTime] = useState('12:00');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [links, setLinks] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // Settings and the Google status load once when the sheet opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase.from('coach_settings').select('booking_enabled, booking_open_weekday, booking_open_time').eq('id', 1).maybeSingle();
      if (cancelled) return;
      if (err || !data) setError("Couldn't load your booking settings — close this and try again.");
      else { setEnabled(data.booking_enabled); setWeekday(data.booking_open_weekday); setOpenTime(data.booking_open_time.slice(0, 5)); }
      setLoaded(true);
      try {
        const res = await fetch('/api/coach/booking-google', { cache: 'no-store' });
        const body = await res.json();
        if (!cancelled && res.ok) setGoogle(body as GoogleStatus);
      } catch { /* status stays unknown */ }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  async function save() {
    if (saving) return;
    setSaving(true); setError(null); setSavedMsg(null);
    const { error: err } = await supabase.from('coach_settings').update({ booking_enabled: enabled, booking_open_weekday: weekday, booking_open_time: openTime, updated_at: new Date().toISOString() }).eq('id', 1);
    setSaving(false);
    if (err) setError("Couldn't save — try again.");
    else setSavedMsg('Saved ✓');
  }

  async function connect() {
    const urls = links.split(/\s+/).map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) { setGoogleError('Paste the link first.'); return; }
    setConnecting(true); setGoogleError(null);
    try {
      const res = await fetch('/api/coach/booking-google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) });
      const body = await res.json();
      if (!res.ok) setGoogleError(body.error || "Couldn't connect — try again.");
      else { setGoogle(body as GoogleStatus); setLinks(''); }
    } catch {
      setGoogleError("Couldn't connect — check your connection and try again.");
    }
    setConnecting(false);
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Google Calendar? Clients will then see all your free hours, even when you have other plans in Google.')) return;
    setConnecting(true); setGoogleError(null);
    try {
      const res = await fetch('/api/coach/booking-google', { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) setGoogleError(body.error || "Couldn't disconnect — try again.");
      else setGoogle(body as GoogleStatus);
    } catch {
      setGoogleError("Couldn't disconnect — try again.");
    }
    setConnecting(false);
  }

  return (
    <Sheet title="Client booking" subtitle="Clients pick their two weekly calls (check-in and info call) from your free hours." onClose={onClose}>
      {!loaded ? <div className="h-24 rounded-xl bg-neutral-100 animate-pulse" /> : (
        <>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-3">
            <span className="text-sm font-medium">Clients can book their own calls</span>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 accent-[var(--brand)]" />
          </label>

          <p className="text-xs font-medium text-neutral-500 mt-4 mb-1.5">Next week opens for booking on</p>
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={field} aria-label="Day">
              {WEEKDAY_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
            </select>
            <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} className={field} aria-label="Time" />
          </div>
          <p className="text-2xs text-neutral-400 mt-1.5">Malta time. Until then clients can only book the rest of this week. Calls start on the hour inside your “My hours”, and never less than 12 hours ahead.</p>
          {error && <p className="text-sm text-status-bad-text mt-2" role="alert">{error}</p>}
          <button onClick={save} disabled={saving} className="mt-3 w-full rounded-xl bg-brand text-white py-2.5 text-sm font-semibold disabled:opacity-50">{saving ? 'Saving…' : savedMsg ?? 'Save'}</button>

          <div className="mt-6 border-t border-border pt-4">
            <p className="text-sm font-semibold">Block your Google Calendar events</p>
            {google === null && <p className="text-xs text-neutral-400 mt-1">Checking…</p>}
            {google?.connected && (
              <div className="mt-2 rounded-xl bg-status-good-bg px-3 py-2.5 text-sm text-status-good-text">
                ✓ Connected · {google.links} calendar{google.links === 1 ? '' : 's'} · {google.events} event{google.events === 1 ? '' : 's'} in the next 2 weeks{google.allDay > 0 ? ` (${google.allDay} all-day)` : ''}
              </div>
            )}
            {google && !google.connected && google.links === 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">Not connected yet — clients see all your free hours, even when you have other plans in Google.</p>
            )}
            {google && !google.connected && google.links > 0 && (
              <p className="mt-2 rounded-xl bg-status-bad-bg px-3 py-2.5 text-xs text-status-bad-text" role="alert">Google couldn’t be read right now ({google.errors.join('; ')}). Clients can’t book until it’s back — paste a fresh link below if it keeps failing.</p>
            )}
            <p className="text-xs text-neutral-500 mt-3 leading-relaxed">Any event in Google (calls or not) blocks that time, so clients can only book when you’re free. To connect: on a computer open Google Calendar → <b>Settings</b> → click your calendar under “Settings for my calendars” → <b>Integrate calendar</b> → copy the <b>Secret address in iCal format</b>, and paste it below. If you keep plans in more than one calendar, paste one link per line.</p>
            <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={3} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" className={`${field} mt-2 resize-none text-xs`} aria-label="Google Calendar secret address" />
            {googleError && <p className="text-sm text-status-bad-text mt-2" role="alert">{googleError}</p>}
            <button onClick={connect} disabled={connecting || !links.trim()} className="mt-2 w-full rounded-xl border border-brand/40 bg-brand-light text-brand-dark py-2.5 text-sm font-semibold disabled:opacity-40">{connecting ? 'Checking…' : google?.links ? 'Replace link' : 'Connect'}</button>
            <p className="text-2xs text-neutral-400 mt-2">That link lets anyone read your whole calendar, so treat it like a password. Vitality keeps it private and never shows it to clients. Google can take a little while to pass on new events.</p>
            {google && google.links > 0 && <button onClick={disconnect} disabled={connecting} className="mt-2 text-xs text-neutral-400 underline py-1">Disconnect Google Calendar</button>}
          </div>
        </>
      )}
    </Sheet>
  );
}
