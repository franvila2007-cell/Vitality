'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addDays, localDateStr } from '@/lib/date';
import WorkoutProgress from '@/components/WorkoutProgress';
import {
  DURATION_CHIPS, EFFORTS, KINDS, KIND_ORDER, durationLabel, fmtKm, goTos, paceLabel, sessionName,
  type TrainingKind, type TrainingSession,
} from '@/lib/training';

type Draft = {
  id?: string;
  kind: TrainingKind;
  date: string;
  title: string;
  duration: string;
  distance: string;
  effort: number | null;
  notes: string;
};

const blankDraft = (kind: TrainingKind, date: string): Draft => ({ kind, date, title: '', duration: '', distance: '', effort: null, notes: '' });
const draftFrom = (s: TrainingSession, date: string): Draft => ({
  kind: s.kind, date, title: s.title ?? '', duration: s.duration_min ? String(s.duration_min) : '',
  distance: s.distance_km ? String(s.distance_km) : '', effort: s.effort, notes: '',
});

function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return addDays(date, -((new Date(y, m - 1, d).getDay() + 6) % 7));
}
const dayName = (date: string, opts: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', opts);
};

// The Training tab: log any kind of session in a couple of taps, see the week
// at a glance, repeat your go-to sessions with one tap, and keep the lift
// tracker (sets/reps/kg) for the gym. `userId` + `readOnly` = coach preview.
export default function TrainingClient({ userId: viewUserId, readOnly = false }: { userId?: string; readOnly?: boolean } = {}) {
  const [supabase] = useState(() => createClient());
  const [today] = useState(() => localDateStr());
  const [userId, setUserId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const uid = viewUserId ?? user.id;
      const { data } = await supabase.from('training_sessions').select('*').eq('user_id', uid)
        .gte('date', addDays(localDateStr(), -365)).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(1000);
      if (cancelled) return;
      setUserId(user.id);
      setSessions((data || []).map((s) => ({ ...s, distance_km: s.distance_km == null ? null : Number(s.distance_km) })) as TrainingSession[]);
    })();
    return () => { cancelled = true; };
  }, [supabase, viewUserId]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const monday = mondayOf(today);
  const week = useMemo(() => (sessions || []).filter((s) => s.date >= monday && s.date <= today), [sessions, monday, today]);
  const weekMin = week.reduce((a, s) => a + (s.duration_min || 0), 0);
  const weekKm = week.reduce((a, s) => a + (s.distance_km || 0), 0);
  const favourites = useMemo(() => goTos(sessions || []), [sessions]);

  async function save(d: Draft) {
    if (!userId) return false;
    const row = {
      user_id: userId,
      date: d.date,
      kind: d.kind,
      title: d.title.trim() || null,
      duration_min: d.duration ? Math.round(Number(d.duration)) || null : null,
      distance_km: KINDS[d.kind].distance && d.distance ? Number(d.distance.replace(',', '.')) || null : null,
      effort: d.effort,
      notes: d.notes.trim() || null,
    };
    const res = d.id
      ? await supabase.from('training_sessions').update(row).eq('id', d.id).select('*').single()
      : await supabase.from('training_sessions').insert(row).select('*').single();
    if (res.error || !res.data) { setToast('Couldn’t save — try again'); return false; }
    const saved = { ...res.data, distance_km: res.data.distance_km == null ? null : Number(res.data.distance_km) } as TrainingSession;
    setSessions((list) => [saved, ...(list || []).filter((s) => s.id !== saved.id)].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)));
    setToast(`${KINDS[saved.kind].emoji} ${sessionName(saved)} ${d.id ? 'updated' : 'logged'}`);
    return true;
  }

  async function remove(s: TrainingSession) {
    if (!window.confirm(`Delete "${sessionName(s)}" on ${dayName(s.date, { day: 'numeric', month: 'short' })}?`)) return;
    const { error } = await supabase.from('training_sessions').delete().eq('id', s.id);
    if (!error) setSessions((list) => (list || []).filter((x) => x.id !== s.id));
  }

  if (!sessions) return <div className="max-w-2xl mx-auto px-4 py-5"><div className="rounded-2xl bg-neutral-100 h-48 animate-pulse" /></div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 page-fade-in">
      {/* This week */}
      <div className="relative overflow-hidden rounded-2xl p-4 text-white bg-hero-gradient">
        <p className="text-3xs uppercase tracking-wide text-white/60">This week</p>
        <div className="mt-1 grid grid-cols-3 gap-2">
          <WeekStat value={String(week.length)} label={week.length === 1 ? 'session' : 'sessions'} />
          <WeekStat value={durationLabel(weekMin) ?? '0 min'} label="active" />
          <WeekStat value={weekKm > 0 ? `${fmtKm(weekKm)} km` : '—'} label="distance" />
        </div>
        <div className="mt-3 flex gap-1.5">
          {Array.from({ length: 7 }, (_, i) => {
            const d = addDays(monday, i);
            const day = week.filter((s) => s.date === d);
            const future = d > today;
            return (
              <div key={d} className="flex-1 flex flex-col items-center gap-1">
                <div className={`w-full aspect-square rounded-lg flex items-center justify-center text-base ${day.length ? 'bg-white/90' : future ? 'bg-white/5' : 'bg-white/10'} ${d === today ? 'ring-2 ring-white/70' : ''}`} title={day.map(sessionName).join(', ') || undefined}>
                  {day.length ? KINDS[day[0].kind].emoji : ''}
                  {day.length > 1 && <span className="sr-only"> +{day.length - 1}</span>}
                </div>
                <span className={`text-3xs ${d === today ? 'text-white' : 'text-white/50'}`}>{dayName(d, { weekday: 'narrow' })}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Log training */}
      {!readOnly && (
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-sm font-medium">Log training</p>
          <p className="text-2xs text-neutral-400 mb-3">Tap what you did — it takes a few seconds.</p>
          <div className="grid grid-cols-5 gap-2">
            {KIND_ORDER.map((k) => (
              <button key={k} onClick={() => setDraft(blankDraft(k, today))} className="flex flex-col items-center gap-1 rounded-xl border border-border bg-neutral-50 py-2.5 transition-transform active:scale-95 hover:border-brand">
                <span className="text-xl" aria-hidden>{KINDS[k].emoji}</span>
                <span className="text-3xs font-medium text-neutral-600">{KINDS[k].label}</span>
              </button>
            ))}
          </div>

          {favourites.length > 0 && (
            <div className="mt-4">
              <p className="text-3xs uppercase tracking-wide text-neutral-400 mb-1.5">Your go-tos · tap to log today</p>
              <div className="flex flex-wrap gap-2">
                {favourites.map((f) => (
                  <button key={f.id} onClick={() => save(draftFrom(f, today))} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-transform active:scale-95 ${KINDS[f.kind].chip}`}>
                    {KINDS[f.kind].emoji} {sessionName(f)}{f.distance_km ? ` · ${fmtKm(f.distance_km)} km` : ''}{f.duration_min ? ` · ${durationLabel(f.duration_min)}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <CardioProgress sessions={sessions} today={today} />

      {/* History */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-medium mb-3">{readOnly ? 'Their training' : 'Your training'}</p>
        {sessions.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-4">{readOnly ? 'Nothing logged yet.' : 'Nothing logged yet — tap a type above to log your first session.'}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {sessions.slice(0, 40).map((s) => {
              const pace = s.kind !== 'cycle' && s.kind !== 'swim' ? paceLabel(s.duration_min, s.distance_km) : null;
              const effort = EFFORTS.find((e) => s.effort != null && Math.abs(e.value - s.effort) <= 1);
              return (
                <div key={s.id} className="flex items-center gap-3 py-2.5">
                  <span className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-lg ${KINDS[s.kind].chip}`} aria-hidden>{KINDS[s.kind].emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{sessionName(s)}</p>
                    <p className="text-2xs text-neutral-500 truncate">
                      {[s.date === today ? 'Today' : s.date === addDays(today, -1) ? 'Yesterday' : dayName(s.date, { weekday: 'short', day: 'numeric', month: 'short' }),
                        s.distance_km ? `${fmtKm(s.distance_km)} km` : null, durationLabel(s.duration_min), pace, effort ? `${effort.emoji} ${effort.label}` : null].filter(Boolean).join(' · ')}
                    </p>
                    {s.notes && <p className="text-2xs text-neutral-400 truncate">{s.notes}</p>}
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setDraft(draftFrom(s, today))} className="rounded-full border border-border px-2.5 py-1 text-2xs font-medium text-brand-dark hover:border-brand">Again</button>
                      <button onClick={() => setDraft({ ...draftFrom(s, s.date), id: s.id, notes: s.notes ?? '' })} className="px-1.5 text-neutral-400 hover:text-neutral-700" aria-label={`Edit ${sessionName(s)}`}>✎</button>
                      <button onClick={() => remove(s)} className="px-1.5 text-neutral-300 hover:text-status-bad-text" aria-label={`Delete ${sessionName(s)}`}>✕</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lift tracker (sets / reps / kg) */}
      <div id="lift-tracker" className="scroll-mt-28">
        <WorkoutProgress userId={viewUserId} readOnly={readOnly} />
      </div>

      {draft && <LogSheet draft={draft} today={today} onClose={() => setDraft(null)} onSave={async (d) => { if (await save(d)) setDraft(null); }} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-neutral-900 text-white text-sm px-4 py-2 shadow-lg animate-[chip-rise_0.3s_ease-out]">
          {toast}
        </div>
      )}
    </div>
  );
}

function WeekStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-xl font-semibold leading-tight">{value}</div>
      <div className="text-3xs uppercase text-white/60">{label}</div>
    </div>
  );
}

// Runs, walks, rides and swims: this month's distance and personal bests.
function CardioProgress({ sessions, today }: { sessions: TrainingSession[]; today: string }) {
  const month = today.slice(0, 7);
  const kinds: TrainingKind[] = ['run', 'walk', 'cycle', 'swim'];
  const rows = kinds.map((k) => {
    const all = sessions.filter((s) => s.kind === k && s.distance_km);
    if (all.length === 0) return null;
    const monthKm = all.filter((s) => s.date.startsWith(month)).reduce((a, s) => a + (s.distance_km || 0), 0);
    const longest = Math.max(...all.map((s) => s.distance_km || 0));
    const paced = all.filter((s) => s.duration_min && (s.distance_km || 0) >= 1);
    const best = paced.length ? paced.reduce((b, s) => (s.duration_min! / s.distance_km! < b.duration_min! / b.distance_km! ? s : b)) : null;
    return { k, monthKm, longest, best, count: all.length };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  // Active minutes per week, last 8 weeks.
  const thisMonday = mondayOf(today);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(thisMonday, -7 * (7 - i));
    const end = addDays(start, 6);
    return { start, min: sessions.filter((s) => s.date >= start && s.date <= end).reduce((a, s) => a + (s.duration_min || 0), 0) };
  });
  const maxMin = Math.max(...weeks.map((w) => w.min));
  if (rows.length === 0 && maxMin === 0) return null;

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <p className="text-sm font-medium mb-3">Progress</p>
      {maxMin > 0 && (
        <div className="mb-4">
          <p className="text-3xs uppercase tracking-wide text-neutral-400 mb-2">Active minutes · last 8 weeks</p>
          <div className="flex items-end gap-1.5 h-20">
            {weeks.map((w, i) => (
              <div key={w.start} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`Week of ${dayName(w.start, { day: 'numeric', month: 'short' })}: ${w.min} min`}>
                <span className="text-3xs text-neutral-400 tabular-nums">{w.min || ''}</span>
                <div className={`w-full rounded-t-md ${i === 7 ? 'bg-brand' : 'bg-brand/35'}`} style={{ height: `${Math.max(w.min ? 6 : 2, (w.min / maxMin) * 100)}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {rows.map((r) => (
            <div key={r.k} className="flex items-center gap-3 rounded-xl bg-neutral-50 px-3 py-2.5">
              <span className="text-xl" aria-hidden>{KINDS[r.k].emoji}</span>
              <div className="min-w-0 flex-1 grid grid-cols-3 gap-2">
                <MiniStat value={`${fmtKm(r.monthKm)} km`} label="this month" />
                <MiniStat value={`${fmtKm(r.longest)} km`} label="longest" />
                <MiniStat value={r.best && r.k !== 'cycle' && r.k !== 'swim' ? (paceLabel(r.best.duration_min, r.best.distance_km) ?? '—') : r.best ? `${(r.best.distance_km! / (r.best.duration_min! / 60)).toFixed(1)} km/h` : '—'} label={r.k === 'cycle' || r.k === 'swim' ? 'best speed' : 'best pace'} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-semibold truncate">{value}</div>
      <div className="text-3xs text-neutral-400">{label}</div>
    </div>
  );
}

function LogSheet({ draft, today, onClose, onSave }: { draft: Draft; today: string; onClose: () => void; onSave: (d: Draft) => Promise<void> }) {
  const [d, setD] = useState(draft);
  const [saving, setSaving] = useState(false);
  const meta = KINDS[d.kind];
  const pace = meta.distance && d.kind !== 'cycle' && d.kind !== 'swim' ? paceLabel(Number(d.duration) || null, Number(d.distance.replace(',', '.')) || null) : null;
  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));
  const yesterday = addDays(today, -1);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Log ${meta.label}`}>
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-lg font-semibold">{meta.emoji} {d.id ? 'Edit' : 'Log'} {meta.label.toLowerCase()}</p>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-lg" aria-label="Close">✕</button>
        </div>

        {/* Type (switchable) */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 mb-4">
          {KIND_ORDER.map((k) => (
            <button key={k} onClick={() => set({ kind: k })} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${d.kind === k ? 'bg-brand text-white border-brand' : 'border-border text-neutral-500'}`}>
              {KINDS[k].emoji} {KINDS[k].label}
            </button>
          ))}
        </div>

        <Field label="When">
          <div className="flex gap-2">
            {[{ v: today, l: 'Today' }, { v: yesterday, l: 'Yesterday' }].map((o) => (
              <button key={o.v} onClick={() => set({ date: o.v })} className={`rounded-full border px-3.5 py-1.5 text-xs font-medium ${d.date === o.v ? 'bg-brand-light border-brand text-brand-dark' : 'border-border text-neutral-600'}`}>{o.l}</button>
            ))}
            <input type="date" value={d.date} max={today} onChange={(e) => e.target.value && set({ date: e.target.value })} className="rounded-full border border-border px-3 py-1 text-xs text-neutral-600" aria-label="Pick a date" />
          </div>
        </Field>

        <Field label="What was it? (optional)">
          <input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder={meta.example} maxLength={60} className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
          {meta.names.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {meta.names.map((n) => (
                <button key={n} onClick={() => set({ title: n })} className={`rounded-full px-2.5 py-1 text-2xs font-medium ${d.title === n ? 'bg-brand text-white' : 'bg-neutral-100 text-neutral-600'}`}>{n}</button>
              ))}
            </div>
          )}
        </Field>

        <Field label="How long?">
          <div className="flex flex-wrap items-center gap-1.5">
            {DURATION_CHIPS.map((m) => (
              <button key={m} onClick={() => set({ duration: String(m) })} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${d.duration === String(m) ? 'bg-brand-light border-brand text-brand-dark' : 'border-border text-neutral-600'}`}>{durationLabel(m)}</button>
            ))}
            <span className="flex items-center gap-1">
              <input inputMode="numeric" value={d.duration} onChange={(e) => set({ duration: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="—" className="w-16 rounded-full border border-border px-3 py-1.5 text-xs text-center" aria-label="Minutes" />
              <span className="text-2xs text-neutral-400">min</span>
            </span>
          </div>
        </Field>

        {meta.distance && (
          <Field label="Distance">
            <div className="flex items-center gap-2">
              <input inputMode="decimal" value={d.distance} onChange={(e) => set({ distance: e.target.value.replace(/[^\d.,]/g, '').slice(0, 6) })} placeholder={d.kind === 'swim' ? '1.5' : '5'} className="w-24 rounded-xl border border-border px-3 py-2 text-sm" aria-label="Kilometres" />
              <span className="text-sm text-neutral-500">km</span>
              {pace && <span className="ml-auto rounded-full bg-brand-light px-3 py-1 text-xs font-medium text-brand-dark">{pace}</span>}
            </div>
          </Field>
        )}

        <Field label="How hard was it?">
          <div className="grid grid-cols-4 gap-2">
            {EFFORTS.map((e) => (
              <button key={e.value} onClick={() => set({ effort: d.effort === e.value ? null : e.value })} className={`flex flex-col items-center rounded-xl border py-2 ${d.effort === e.value ? 'bg-brand-light border-brand' : 'border-border'}`}>
                <span className="text-lg" aria-hidden>{e.emoji}</span>
                <span className="text-3xs font-medium text-neutral-600">{e.label}</span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Notes (optional)">
          <textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} maxLength={300} placeholder="How it felt, what you did…" className="w-full rounded-xl border border-border px-3 py-2 text-sm resize-none" />
        </Field>

        {d.kind === 'strength' && !d.id && (
          <p className="text-2xs text-neutral-500 mb-3">Want to track your weights and PRs too? Use the <a href="#lift-tracker" onClick={onClose} className="font-medium text-brand-dark underline">lift tracker</a> further down.</p>
        )}

        <button
          disabled={saving}
          onClick={async () => { setSaving(true); await onSave(d); setSaving(false); }}
          className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? 'Saving…' : d.id ? 'Save changes' : `Log ${meta.label.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-2xs font-medium text-neutral-500 mb-1.5">{label}</p>
      {children}
    </div>
  );
}
