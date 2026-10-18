'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addDays, localDateStr } from '@/lib/date';
import {
  HABIT_EMOJIS, HABIT_SUGGESTIONS, WEEKDAYS, WEEK_ORDER,
  habitDay, habitsDueOn, isHabitActive, scheduleLabel, weekday, type Habit,
} from '@/lib/habits';
import HabitCalendar from '@/components/habits/HabitCalendar';
import { fetchAll } from '@/lib/supabase/paginate';

const HISTORY_DAYS = 180;

type Schedule = 'daily' | 'days' | 'once';

// One tap instead of toggling seven buttons.
const SCHEDULE_PRESETS: { label: string; days: number[] }[] = [
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'Weekends', days: [6, 0] },
  { label: 'Mon · Wed · Fri', days: [1, 3, 5] },
  { label: 'Tue · Thu', days: [2, 4] },
  { label: 'Mon · Wed · Sat', days: [1, 3, 6] },
];
type Draft = { id: string | null; label: string; emoji: string; schedule: Schedule; days: number[]; onDate: string };

// The client's Habits tab: their own habits plus their coach's, on a
// calendar. Ticking works for today and yesterday (for anyone who forgot
// last night) — older days are history.
export default function HabitsClient() {
  const [supabase] = useState(() => createClient());
  const [today] = useState(() => localDateStr());
  const [userId, setUserId] = useState<string | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [done, setDone] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    let habitsRes, completions: { habit_id: string; date: string }[];
    try {
      [habitsRes, completions] = await Promise.all([
        supabase.from('habits').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }),
        // >1000 ticks in 180 days is normal for a busy client — page through them all.
        fetchAll<{ habit_id: string; date: string }>((from, to) =>
          supabase.from('habit_completions').select('habit_id, date').eq('user_id', user.id).eq('completed', true).gte('date', addDays(today, -HISTORY_DAYS)).order('date', { ascending: false }).range(from, to)),
      ]);
    } catch {
      setLoadError(true); setLoading(false); return;
    }
    if (habitsRes.error) { setLoadError(true); setLoading(false); return; }
    setLoadError(false);
    setHabits(habitsRes.data || []);
    const byDate: Record<string, string[]> = {};
    for (const r of completions) (byDate[r.date] ||= []).push(r.habit_id);
    setDone(byDate);
    setLoading(false);
    // Arrived from Today's "+ Add" / "Plan your week": open the sheet straight away.
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('new')) {
      window.history.replaceState(null, '', window.location.pathname);
      setDraft({ id: null, label: '', emoji: '✅', schedule: 'daily', days: [weekday(today)], onDate: today });
    }
  }, [supabase, today]);

  // Kicked off after mount rather than called synchronously in the effect
  // body (load() only sets state once its queries resolve anyway).
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => { if (alive) load(); });
    return () => { alive = false; };
  }, [load]);

  const yesterday = addDays(today, -1);
  const canToggle = (date: string) => date === today || date === yesterday;

  async function toggle(habitId: string, date: string) {
    if (!userId || !canToggle(date)) return;
    const isDone = (done[date] || []).includes(habitId);
    const apply = (on: boolean) => setDone((d) => ({ ...d, [date]: on ? [...new Set([...(d[date] || []), habitId])] : (d[date] || []).filter((x) => x !== habitId) }));
    apply(!isDone);
    const { error: saveErr } = await supabase.from('habit_completions').upsert(
      { user_id: userId, habit_id: habitId, date, completed: !isDone },
      { onConflict: 'user_id,habit_id,date' }
    );
    if (saveErr) { apply(isDone); setError("Couldn't save that tick — check your connection and try again."); setTimeout(() => setError(null), 4000); }
  }

  function openNew(preset?: Partial<Draft>) {
    setError(null);
    setDraft({ id: null, label: '', emoji: '✅', schedule: 'daily', days: [weekday(today)], onDate: today, ...preset });
  }

  function openEdit(h: Habit) {
    setError(null);
    setDraft({
      id: h.id, label: h.label, emoji: h.emoji || '✅',
      schedule: h.on_date ? 'once' : h.days ? 'days' : 'daily',
      days: h.days ?? [weekday(today)], onDate: h.on_date ?? today,
    });
  }

  async function save(another = false) {
    if (!draft || !userId) return;
    const label = draft.label.trim();
    if (!label) { setError('Give your habit a name.'); return; }
    if (draft.schedule === 'days' && draft.days.length === 0) { setError('Pick at least one day.'); return; }
    if (draft.schedule === 'once' && draft.onDate < today) { setError('Pick today or a day in the future.'); return; }
    setSaving(true);
    setError(null);
    const schedule = {
      label: label.slice(0, 80),
      emoji: draft.emoji,
      days: draft.schedule === 'days' ? [...draft.days].sort() : null,
      on_date: draft.schedule === 'once' ? draft.onDate : null,
    };
    const res = draft.id
      ? await supabase.from('habits').update(schedule).eq('id', draft.id)
      : await supabase.from('habits').insert({
          ...schedule,
          user_id: userId,
          key: `client-${crypto.randomUUID?.() ?? Date.now().toString(36)}`,
          tag: '',
          starts_on: today,
          added_by: 'client',
          sort_order: habits.reduce((m, h) => Math.max(m, h.sort_order), 0) + 1,
        });
    setSaving(false);
    if (res.error) { setError("Couldn't save that habit. Please try again."); return; }
    // "Save & add another" keeps the sheet open with the same schedule, ready for the next habit.
    setDraft(another && !draft.id ? { ...draft, label: '', emoji: '✅' } : null);
    load();
  }

  // Removing archives the habit from today on, so the days it was part of
  // keep their rank. One added today with nothing behind it is just deleted.
  async function remove(h: Habit) {
    if (!confirm(`Remove "${h.label}"? Past days you ticked it stay in your history.`)) return;
    const res = h.starts_on >= today
      ? await supabase.from('habits').delete().eq('id', h.id)
      : await supabase.from('habits').update({ archived_on: today }).eq('id', h.id);
    if (!res.error) { setDraft(null); load(); }
  }

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-5"><div className="h-96 rounded-2xl bg-neutral-100 animate-pulse" /></div>;
  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-5">
        <div className="bg-surface border border-border rounded-2xl p-5 text-center">
          <p className="text-sm font-medium mb-1">Couldn&rsquo;t load your habits</p>
          <p className="text-xs text-neutral-400 mb-3">Check your connection and try again.</p>
          <button onClick={() => { setLoadError(false); setLoading(true); load(); }} className="rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium">Try again</button>
        </div>
      </div>
    );
  }

  const active = habits.filter((h) => isHabitActive(h, today));
  const doneMap = new Map(Object.entries(done).map(([d, ids]) => [d, new Set(ids)]));
  // This week so far (Mon → today) and the last 30 days.
  const weekStartOffset = (weekday(today) + 6) % 7;
  const tally = (days: number) => {
    let total = 0, hit = 0;
    for (let i = 0; i < days; i++) {
      const d = habitDay(habits, doneMap, addDays(today, -i));
      total += d.total; hit += d.done;
    }
    return { total, hit, pct: total ? Math.round((hit / total) * 100) : null };
  };
  const week = tally(weekStartOffset + 1);
  const month = tally(30);
  const todayDue = habitsDueOn(habits, today);
  const minMonth = addDays(today, -HISTORY_DAYS).slice(0, 8) + '01';

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 page-fade-in">
      {error && !draft && <p className="rounded-xl bg-status-bad-bg text-status-bad-text text-sm px-4 py-2.5" role="alert">{error}</p>}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white bg-hero-gradient">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-white/70">Your habits</p>
            <p className="text-2xl font-medium mt-0.5">Plan it. Tick it. Go gold.</p>
          </div>
          <button onClick={() => openNew()} className="flex-shrink-0 rounded-full bg-white text-brand-dark text-sm font-semibold px-4 py-2 transition-transform active:scale-95">+ Add</button>
        </div>
        <div className="relative flex gap-6 mt-4">
          <Stat value={`${todayDue.filter((h) => doneMap.get(today)?.has(h.id)).length}/${todayDue.length}`} label="Today" />
          <Stat value={week.total ? `${week.hit}/${week.total}` : '–'} label="This week" />
          <Stat value={month.pct == null ? '–' : `${month.pct}%`} label="Last 30 days" />
        </div>
      </div>

      <HabitCalendar
        habits={habits}
        done={done}
        today={today}
        minMonth={minMonth}
        canToggle={canToggle}
        onToggle={toggle}
        onAddForDate={(date) => openNew({ schedule: 'once', onDate: date, days: [weekday(date)] })}
      />

      <div className="bg-surface border border-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">My habits</p>
          <button onClick={() => openNew()} className="text-xs font-medium text-brand-dark hover:opacity-70">+ Add habit</button>
        </div>
        {active.length === 0 && <p className="text-sm text-neutral-400">No habits yet. Add one — like a 5k run three times a week.</p>}
        <div className="flex flex-col gap-2">
          {active.map((h) => {
            const own = h.added_by === 'client';
            return (
              <div key={h.id} className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-3">
                <span className="w-9 h-9 rounded-full bg-neutral-50 flex items-center justify-center text-lg flex-shrink-0">{h.emoji || '✅'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{h.label}</p>
                  <p className="text-2xs text-neutral-400">{scheduleLabel(h)}{own ? '' : ' · from your coach'}</p>
                </div>
                {own && (
                  <button onClick={() => openEdit(h)} className="text-xs font-medium text-neutral-500 hover:text-neutral-800 px-2 py-1">Edit</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setDraft(null)}>
          <div className="bg-surface rounded-3xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold mb-4">{draft.id ? 'Edit habit' : 'Add a habit'}</p>

            {!draft.id && (
              <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1">
                {HABIT_SUGGESTIONS.map((sug) => (
                  <button
                    key={sug.label}
                    onClick={() => setDraft((d) => d && ({ ...d, label: sug.label, emoji: sug.emoji, schedule: sug.days ? 'days' : 'daily', days: sug.days ?? d.days }))}
                    className="flex-shrink-0 rounded-full border border-border bg-neutral-50 px-3 py-1.5 text-xs text-neutral-700 whitespace-nowrap hover:border-brand"
                  >
                    {sug.emoji} {sug.label}
                  </button>
                ))}
              </div>
            )}

            <label className="block text-xs font-medium text-neutral-500 mb-1.5">Habit</label>
            <div className="flex gap-2 mb-3">
              <span className="w-12 h-12 rounded-2xl bg-neutral-50 border border-border flex items-center justify-center text-2xl flex-shrink-0">{draft.emoji}</span>
              <input
                value={draft.label}
                onChange={(e) => setDraft((d) => d && ({ ...d, label: e.target.value }))}
                placeholder="e.g. 5k run"
                maxLength={80}
                autoFocus
                className="flex-1 min-w-0 rounded-2xl border border-border px-4 text-base outline-none focus:border-brand"
              />
            </div>
            <div className="flex flex-wrap gap-1 mb-5">
              {HABIT_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setDraft((d) => d && ({ ...d, emoji: e }))}
                  className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center ${draft.emoji === e ? 'bg-brand-light ring-2 ring-brand' : 'hover:bg-neutral-100'}`}
                >{e}</button>
              ))}
            </div>

            <label className="block text-xs font-medium text-neutral-500 mb-1.5">When</label>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1 mb-3">
              {([['daily', 'Every day'], ['days', 'Pick days'], ['once', 'One day']] as const).map(([key, text]) => (
                <button
                  key={key}
                  onClick={() => setDraft((d) => d && ({ ...d, schedule: key }))}
                  className={`rounded-xl py-2 text-sm font-medium ${draft.schedule === key ? 'bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-neutral-900' : 'text-neutral-500'}`}
                >{text}</button>
              ))}
            </div>
            {draft.schedule === 'days' && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {SCHEDULE_PRESETS.map((pr) => {
                  const on = pr.days.length === draft.days.length && pr.days.every((d) => draft.days.includes(d));
                  return (
                    <button
                      key={pr.label}
                      onClick={() => setDraft((x) => x && ({ ...x, days: pr.days }))}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${on ? 'bg-brand-light border-brand text-brand-dark' : 'border-border text-neutral-600 hover:border-neutral-300'}`}
                    >{pr.label}</button>
                  );
                })}
              </div>
            )}
            {draft.schedule === 'days' && (
              <div className="grid grid-cols-7 gap-1.5 mb-3">
                {WEEK_ORDER.map((d) => {
                  const on = draft.days.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => setDraft((x) => x && ({ ...x, days: on ? x.days.filter((y) => y !== d) : [...x.days, d] }))}
                      className={`h-11 rounded-xl text-xs font-medium border ${on ? 'bg-brand text-white border-brand' : 'border-border text-neutral-600'}`}
                    >{WEEKDAYS[d]}</button>
                  );
                })}
              </div>
            )}
            {draft.schedule === 'once' && (
              <input
                type="date"
                value={draft.onDate}
                min={today}
                onChange={(e) => setDraft((d) => d && ({ ...d, onDate: e.target.value }))}
                className="w-full rounded-2xl border border-border px-4 h-12 text-base outline-none focus:border-brand mb-3"
              />
            )}
            <p className="text-2xs text-neutral-400 mb-4">It&rsquo;ll show up on your Today screen on those days, and ticking it off counts towards your daily rank.</p>

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <div className="flex gap-2">
              {draft.id && (
                <button onClick={() => { const h = habits.find((x) => x.id === draft.id); if (h) remove(h); }} className="rounded-2xl border border-red-200 text-red-600 px-4 py-3 text-sm font-medium">Remove</button>
              )}
              <button onClick={() => setDraft(null)} className="flex-1 rounded-2xl border border-border text-neutral-600 py-3 text-sm font-medium">Cancel</button>
              <button onClick={() => save()} disabled={saving} className="flex-1 rounded-2xl bg-brand text-white py-3 text-sm font-semibold disabled:opacity-50">
                {saving ? 'Saving…' : draft.id ? 'Save' : 'Add habit'}
              </button>
            </div>
            {!draft.id && (
              <button onClick={() => save(true)} disabled={saving} className="w-full mt-2 rounded-2xl border border-brand/40 text-brand-dark py-2.5 text-sm font-medium disabled:opacity-50">
                Save &amp; add another
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-xl font-medium">{value}</div>
      <div className="text-3xs uppercase text-white/50 mt-0.5">{label}</div>
    </div>
  );
}
