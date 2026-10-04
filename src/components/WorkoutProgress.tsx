'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { localDateStr } from '@/lib/date';
import {
  buildSessions, compareToHistory, fmtKg, fmtSet, isBodyweight, metricValue, round1,
  strengthChangePct, summariseMonth, WEIGHT_STEP, WORKOUT_PRESETS, GENERIC_EXERCISES,
  type Metric, type SetRow, type Session,
} from '@/lib/workouts';
import type { Database } from '@/lib/supabase/database.types';

type Workout = Database['public']['Tables']['workouts']['Row'];
type Exercise = Database['public']['Tables']['workout_exercises']['Row'];

const PAGE = 1000; // PostgREST returns at most 1000 rows per request
let tempSetCounter = 0; // ids for optimistic sets, until the insert returns the real row

export default function WorkoutProgress() {
  const [supabase] = useState(() => createClient());
  const [today] = useState(() => localDateStr());
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newWorkoutOpen, setNewWorkoutOpen] = useState(false);
  const [customWorkout, setCustomWorkout] = useState('');
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [customExercise, setCustomExercise] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [wRes, eRes] = await Promise.all([
      supabase.from('workouts').select('*').eq('user_id', user.id).order('sort_order').order('created_at'),
      supabase.from('workout_exercises').select('*').eq('user_id', user.id).order('sort_order').order('created_at'),
    ]);
    if (wRes.error || eRes.error) { setLoadError(true); setLoading(false); return; }

    const all: SetRow[] = [];
    for (let from = 0; from < PAGE * 20; from += PAGE) {
      const { data, error } = await supabase
        .from('workout_sets').select('id, exercise_id, date, set_number, weight_kg, reps, created_at')
        .eq('user_id', user.id).order('date').order('set_number').range(from, from + PAGE - 1);
      if (error) { setLoadError(true); setLoading(false); return; }
      for (const r of data || []) all.push({ ...r, weight_kg: Number(r.weight_kg) });
      if (!data || data.length < PAGE) break;
    }

    setWorkouts(wRes.data || []);
    setExercises(eRes.data || []);
    setSets(all);
    setSelectedId((cur) => cur ?? wRes.data?.[0]?.id ?? null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const setsByExercise = useMemo(() => {
    const m = new Map<string, SetRow[]>();
    for (const s of sets) {
      const arr = m.get(s.exercise_id);
      if (arr) arr.push(s); else m.set(s.exercise_id, [s]);
    }
    return m;
  }, [sets]);

  const sessionsByExercise = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const e of exercises) m.set(e.id, buildSessions(setsByExercise.get(e.id) || []));
    return m;
  }, [exercises, setsByExercise]);

  const summary = useMemo(() => {
    const monthStart = today.slice(0, 7) + '-01';
    const [y, mo] = today.split('-').map(Number);
    const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
    return summariseMonth(exercises, setsByExercise, monthStart, next);
  }, [exercises, setsByExercise, today]);

  const selected = workouts.find((w) => w.id === selectedId) ?? null;
  const selectedExercises = exercises.filter((e) => e.workout_id === selectedId);

  async function createWorkout(rawName: string) {
    const name = rawName.trim();
    if (!name || !userId || busy) return;
    setBusy(true);
    const { data, error } = await supabase.from('workouts')
      .insert({ user_id: userId, name, sort_order: workouts.length }).select('*').single();
    setBusy(false);
    if (error || !data) return;
    setWorkouts((w) => [...w, data]);
    setSelectedId(data.id);
    setNewWorkoutOpen(false);
    setCustomWorkout('');
    setAddExerciseOpen(true);
  }

  async function deleteWorkout(id: string) {
    const w = workouts.find((x) => x.id === id);
    if (!w || !window.confirm(`Delete "${w.name}" and all its logged sets? This can't be undone.`)) return;
    const exIds = new Set(exercises.filter((e) => e.workout_id === id).map((e) => e.id));
    const { error } = await supabase.from('workouts').delete().eq('id', id);
    if (error) return;
    setWorkouts((list) => list.filter((x) => x.id !== id));
    setExercises((list) => list.filter((e) => e.workout_id !== id));
    setSets((list) => list.filter((s) => !exIds.has(s.exercise_id)));
    setSelectedId((cur) => (cur === id ? workouts.find((x) => x.id !== id)?.id ?? null : cur));
  }

  async function addExercise(rawName: string) {
    const name = rawName.trim();
    if (!name || !userId || !selectedId || busy) return;
    if (selectedExercises.some((e) => e.name.toLowerCase() === name.toLowerCase())) return;
    setBusy(true);
    const { data, error } = await supabase.from('workout_exercises')
      .insert({ user_id: userId, workout_id: selectedId, name, sort_order: selectedExercises.length }).select('*').single();
    setBusy(false);
    if (error || !data) return;
    setExercises((list) => [...list, data]);
    setCustomExercise('');
  }

  async function deleteExercise(id: string) {
    const e = exercises.find((x) => x.id === id);
    if (!e || !window.confirm(`Remove "${e.name}" and its history?`)) return;
    const { error } = await supabase.from('workout_exercises').delete().eq('id', id);
    if (error) return;
    setExercises((list) => list.filter((x) => x.id !== id));
    setSets((list) => list.filter((s) => s.exercise_id !== id));
  }

  // Optimistic: the set appears instantly and is swapped for the stored row
  // (real id) once the insert returns; a failed insert just removes it again.
  async function addSet(exerciseId: string, date: string, weightKg: number, reps: number) {
    if (!userId) return;
    const existing = setsByExercise.get(exerciseId)?.filter((s) => s.date === date) ?? [];
    const setNumber = existing.reduce((mx, s) => Math.max(mx, s.set_number), 0) + 1;
    const tempId = 'tmp-' + ++tempSetCounter;
    const temp: SetRow = { id: tempId, exercise_id: exerciseId, date, set_number: setNumber, weight_kg: weightKg, reps, created_at: new Date().toISOString() };
    setSets((list) => [...list, temp]);
    const { data, error } = await supabase.from('workout_sets')
      .insert({ user_id: userId, exercise_id: exerciseId, date, set_number: setNumber, weight_kg: weightKg, reps })
      .select('id, exercise_id, date, set_number, weight_kg, reps, created_at').single();
    if (error || !data) { setSets((list) => list.filter((s) => s.id !== tempId)); return; }
    setSets((list) => list.map((s) => (s.id === tempId ? { ...data, weight_kg: Number(data.weight_kg) } : s)));
  }

  async function deleteSet(id: string) {
    setSets((list) => list.filter((s) => s.id !== id));
    if (!id.startsWith('tmp-')) await supabase.from('workout_sets').delete().eq('id', id);
  }

  if (loading) {
    return <div className="bg-surface border border-border rounded-2xl p-4 h-40 animate-pulse" />;
  }
  if (loadError) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-medium mb-1">Workout Progress</p>
        <p className="text-sm text-neutral-400">Couldn&rsquo;t load your workouts just now. Refresh to try again.</p>
      </div>
    );
  }

  const unusedPresets = Object.keys(WORKOUT_PRESETS).filter((p) => !workouts.some((w) => w.name.toLowerCase() === p.toLowerCase()));
  const suggestions = selected
    ? (WORKOUT_PRESETS[Object.keys(WORKOUT_PRESETS).find((p) => p.toLowerCase() === selected.name.toLowerCase()) ?? ''] ?? GENERIC_EXERCISES)
        .filter((n) => !selectedExercises.some((e) => e.name.toLowerCase() === n.toLowerCase()))
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-3xs uppercase tracking-wide text-neutral-400 mb-1">Strength</p>
        <p className="text-sm font-medium mb-1">Workout Progress</p>
        <p className="text-xs text-neutral-400 mb-4">Log your sets and see, at a glance, whether you&rsquo;re getting stronger.</p>

        <p className="text-3xs uppercase tracking-wide text-neutral-400 mb-2">This month</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Stat value={summary.workoutsCompleted} label="Workouts completed" />
          <Stat value={summary.exercisesImproved} label="Exercises improved" />
          <Stat value={summary.newPRs} label="New PRs" gold={summary.newPRs > 0} />
        </div>
        <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-3.5 py-2.5">
          <span className="text-xs text-neutral-500">Strength trend</span>
          {summary.strengthTrendPct == null ? (
            <span className="text-xs text-neutral-400">Log an exercise twice to see it</span>
          ) : (
            <TrendValue pct={summary.strengthTrendPct} suffix=" this month" />
          )}
        </div>
      </div>

      {/* Choose workout */}
      <div className="bg-surface border border-border rounded-2xl p-4 min-w-0">
        {workouts.length === 0 && !newWorkoutOpen ? (
          <div>
            <p className="text-sm font-medium mb-1">Start with a workout</p>
            <p className="text-xs text-neutral-400 mb-3">Pick one to begin, or name your own.</p>
            <NewWorkoutPicker presets={unusedPresets} custom={customWorkout} setCustom={setCustomWorkout} onCreate={createWorkout} busy={busy} />
          </div>
        ) : (
          <>
            <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
              {workouts.map((w) => (
                <button
                  key={w.id}
                  onClick={() => { setSelectedId(w.id); setNewWorkoutOpen(false); setAddExerciseOpen(false); }}
                  className={`flex-shrink-0 rounded-full border text-xs font-medium px-3.5 py-1.5 whitespace-nowrap transition-transform active:scale-95 ${
                    w.id === selectedId && !newWorkoutOpen ? 'bg-brand text-white border-brand' : 'border-border text-neutral-600 bg-neutral-50'
                  }`}
                >
                  {w.name}
                </button>
              ))}
              <button
                onClick={() => setNewWorkoutOpen((o) => !o)}
                className={`flex-shrink-0 rounded-full border border-dashed text-xs font-medium px-3.5 py-1.5 whitespace-nowrap transition-transform active:scale-95 ${
                  newWorkoutOpen ? 'border-brand text-brand-dark bg-brand-light' : 'border-neutral-300 text-neutral-500'
                }`}
              >
                + New workout
              </button>
            </div>

            {newWorkoutOpen && (
              <div className="mt-2 border-t border-border pt-3">
                <NewWorkoutPicker presets={unusedPresets} custom={customWorkout} setCustom={setCustomWorkout} onCreate={createWorkout} busy={busy} />
              </div>
            )}

            {selected && !newWorkoutOpen && (
              <div className="mt-2 flex flex-col gap-3">
                {selectedExercises.length === 0 && (
                  <p className="text-sm text-neutral-400 text-center py-3">Add your first exercise to {selected.name}.</p>
                )}
                {selectedExercises.map((ex) => (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    sessions={sessionsByExercise.get(ex.id) || []}
                    today={today}
                    onAddSet={(date, w, r) => addSet(ex.id, date, w, r)}
                    onDeleteSet={deleteSet}
                    onRemove={() => deleteExercise(ex.id)}
                  />
                ))}

                {addExerciseOpen ? (
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs font-medium text-neutral-500 mb-2">Add an exercise</p>
                    {suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {suggestions.map((n) => (
                          <button
                            key={n}
                            onClick={() => addExercise(n)}
                            disabled={busy}
                            className="rounded-full border border-brand/30 bg-brand-light text-brand-dark text-xs font-medium px-3 py-1.5 disabled:opacity-50 transition-transform active:scale-95"
                          >
                            + {n}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        value={customExercise}
                        onChange={(e) => setCustomExercise(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addExercise(customExercise); }}
                        placeholder="Or type your own…"
                        maxLength={60}
                        className="flex-1 min-w-0 rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-brand transition-colors"
                      />
                      <button
                        onClick={() => addExercise(customExercise)}
                        disabled={busy || !customExercise.trim()}
                        className="rounded-lg bg-brand text-white px-4 text-sm font-medium disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                    <button onClick={() => setAddExerciseOpen(false)} className="mt-2.5 text-xs text-neutral-400 hover:text-neutral-600">Done</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddExerciseOpen(true)}
                    className="rounded-xl border border-dashed border-neutral-300 text-neutral-500 text-sm font-medium py-2.5 transition-colors hover:border-brand hover:text-brand-dark"
                  >
                    + Add exercise
                  </button>
                )}

                <button onClick={() => deleteWorkout(selected.id)} className="self-center text-2xs text-neutral-300 hover:text-red-500 transition-colors">
                  Delete this workout
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NewWorkoutPicker({ presets, custom, setCustom, onCreate, busy }: {
  presets: string[]; custom: string; setCustom: (v: string) => void; onCreate: (name: string) => void; busy: boolean;
}) {
  return (
    <div>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => onCreate(p)}
              disabled={busy}
              className="rounded-full border border-brand/30 bg-brand-light text-brand-dark text-xs font-medium px-3.5 py-1.5 disabled:opacity-50 transition-transform active:scale-95"
            >
              {p}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onCreate(custom); }}
          placeholder="Custom workout name…"
          maxLength={60}
          className="flex-1 min-w-0 rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-brand transition-colors"
        />
        <button
          onClick={() => onCreate(custom)}
          disabled={busy || !custom.trim()}
          className="rounded-lg bg-brand text-white px-4 text-sm font-medium disabled:opacity-50"
        >
          Create
        </button>
      </div>
    </div>
  );
}

function Stat({ value, label, gold }: { value: number; label: string; gold?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${gold ? 'bg-rank-gold-bg' : 'bg-neutral-50'}`}>
      <div className={`text-xl font-medium ${gold ? 'text-rank-gold-text' : ''}`}>{value}</div>
      <div className="text-3xs uppercase text-neutral-400 mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

function TrendValue({ pct, suffix = '' }: { pct: number; suffix?: string }) {
  const rounded = round1(pct);
  const up = rounded > 0, down = rounded < 0;
  const color = up ? 'text-status-good-text' : down ? 'text-status-bad-text' : 'text-neutral-500';
  return (
    <span className={`text-sm font-medium ${color}`}>
      {up ? '↑ +' : down ? '↓ −' : '→ '}{Math.abs(rounded)}%{suffix}
    </span>
  );
}

function ExerciseCard({ exercise, sessions, today, onAddSet, onDeleteSet, onRemove }: {
  exercise: Exercise;
  sessions: Session[];
  today: string;
  onAddSet: (date: string, weightKg: number, reps: number) => void;
  onDeleteSet: (id: string) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const latest = sessions[sessions.length - 1] ?? null;
  const previous = sessions.length > 1 ? sessions[sessions.length - 2] : null;
  const bodyweight = isBodyweight(sessions);
  const pct = latest && previous ? strengthChangePct(previous, latest) : null;

  return (
    <div className={`rounded-xl border p-3.5 transition-colors ${latest?.isPR ? 'border-rank-gold bg-rank-gold-bg/30' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-2.5">
        <p className="flex-1 min-w-0 text-sm font-medium truncate">{exercise.name}</p>
        {latest?.isPR && (
          <span className="flex-shrink-0 text-3xs font-semibold tracking-wide rounded-full bg-rank-gold text-neutral-900 px-2 py-0.5">NEW PR</span>
        )}
      </div>

      {latest ? (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Fact label="Latest" value={fmtSet(latest.best)} />
          <Fact label="Previous" value={previous ? fmtSet(previous.best) : '—'} />
          <div>
            <p className="text-3xs uppercase text-neutral-400 mb-0.5">Change</p>
            {pct == null ? <p className="text-sm text-neutral-300">—</p> : (
              <>
                <TrendValue pct={pct} />
                <span className="block text-3xs text-neutral-400 leading-tight">{bodyweight ? 'reps' : 'strength'}</span>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-neutral-400 mb-3">No sets yet — tap &ldquo;Log sets&rdquo; to record your first.</p>
      )}

      {latest && <MiniChart sessions={sessions} bodyweight={bodyweight} />}

      <button
        onClick={() => setOpen((o) => !o)}
        className={`mt-3 w-full rounded-lg py-2 text-sm font-medium transition-transform active:scale-[0.98] ${open ? 'border border-border text-neutral-500' : 'bg-brand text-white'}`}
      >
        {open ? 'Close' : 'Log sets'}
      </button>

      {open && (
        <SetLogger
          sessions={sessions}
          today={today}
          onAddSet={onAddSet}
          onDeleteSet={onDeleteSet}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-3xs uppercase text-neutral-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  );
}

// The fast path: weight and reps come pre-filled (from the previous set today,
// else the same set number last session), so repeating a set is a single tap,
// and a +/- stepper covers the usual tweak without opening a keyboard.
function SetLogger({ sessions, today, onAddSet, onDeleteSet, onRemove }: {
  sessions: Session[];
  today: string;
  onAddSet: (date: string, weightKg: number, reps: number) => void;
  onDeleteSet: (id: string) => void;
  onRemove: () => void;
}) {
  const [date, setDate] = useState(today);
  const [dateOpen, setDateOpen] = useState(false);
  const [draft, setDraft] = useState<{ w: string; r: string } | null>(null);

  const earlier = sessions.filter((s) => s.date < date);
  const last = earlier[earlier.length - 1] ?? null;
  const thisDay = sessions.find((s) => s.date === date) ?? null;
  const daySets = thisDay?.sets ?? [];
  const nextNo = daySets.length + 1;

  const base = daySets[daySets.length - 1] ?? last?.sets[Math.min(nextNo, last.sets.length) - 1] ?? last?.best ?? null;
  const wStr = draft?.w ?? (base ? fmtKg(base.weight_kg) : '');
  const rStr = draft?.r ?? (base ? String(base.reps) : '');
  const w = parseFloat(wStr.replace(',', '.'));
  const r = parseInt(rStr, 10);
  const valid = Number.isFinite(w) && w >= 0 && w <= 1000 && Number.isFinite(r) && r >= 1 && r <= 200;
  const cmp = valid ? compareToHistory({ weight_kg: w, reps: r }, earlier) : null;

  const setW = (v: string) => setDraft({ w: v, r: rStr });
  const setR = (v: string) => setDraft({ w: wStr, r: v });
  const stepW = (d: number) => setW(fmtKg(Math.max(0, (Number.isFinite(w) ? w : 0) + d)));
  const stepR = (d: number) => setR(String(Math.max(1, (Number.isFinite(r) ? r : 0) + d)));

  function add() {
    if (!valid) return;
    onAddSet(date, w, r);
    setDraft(null); // next set pre-fills from the one just logged
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-neutral-50 px-3 py-2 min-w-0">
          <p className="text-3xs uppercase text-neutral-400 mb-0.5">Last session</p>
          <p className="text-sm font-medium truncate">{last ? fmtSet(last.best) : 'First time!'}</p>
          {last && <p className="text-3xs text-neutral-400 mt-0.5 truncate">{shortDate(last.date)}</p>}
        </div>
        <div className={`rounded-lg px-3 py-2 min-w-0 ${cmp?.improved ? 'bg-status-good-bg' : 'bg-neutral-50'}`}>
          <p className="text-3xs uppercase text-neutral-400 mb-0.5">{date === today ? 'Today' : shortDate(date)}</p>
          <p className="text-sm font-medium truncate">{valid ? fmtSet({ weight_kg: w, reps: r }) : '—'}</p>
          <div className="h-4 mt-0.5">
            {cmp?.isPR ? (
              <span className="text-3xs font-semibold text-rank-gold-text">{cmp.delta ? `${cmp.delta} PR` : 'PR'}</span>
            ) : cmp?.improved && cmp.delta ? (
              <span className="text-3xs font-semibold text-status-good-text">{cmp.delta}</span>
            ) : cmp?.delta ? (
              <span className="text-3xs text-neutral-400">{cmp.delta}</span>
            ) : null}
          </div>
        </div>
      </div>

      {daySets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {daySets.map((s, i) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-brand-light text-brand-dark text-xs font-medium pl-2.5 pr-1.5 py-1">
              <span className="text-brand-dark/60">{i + 1}</span> {fmtSet(s)}
              <button onClick={() => onDeleteSet(s.id)} className="text-brand-dark/40 hover:text-red-500 transition-colors px-0.5" aria-label={`Remove set ${i + 1}`}>✕</button>
            </span>
          ))}
          {thisDay?.isPR && <span className="inline-flex items-center rounded-full bg-rank-gold text-neutral-900 text-3xs font-semibold px-2 py-1">NEW PR</span>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-2.5">
        <Stepper label="Weight (kg)" value={wStr} onChange={setW} onStep={stepW} step={WEIGHT_STEP} inputMode="decimal" />
        <Stepper label="Reps" value={rStr} onChange={setR} onStep={stepR} step={1} inputMode="numeric" />
      </div>
      <button
        onClick={add}
        disabled={!valid}
        className="w-full rounded-lg bg-brand text-white py-2.5 text-sm font-medium disabled:opacity-40 transition-transform active:scale-[0.98]"
      >
        Add set {nextNo}
      </button>

      <div className="flex items-center justify-between mt-3">
        <button onClick={() => setDateOpen((o) => !o)} className="text-2xs text-neutral-400 hover:text-neutral-600 transition-colors">
          {dateOpen ? 'Hide date' : date === today ? 'Different day?' : `Logging for ${shortDate(date)}`}
        </button>
        <button onClick={onRemove} className="text-2xs text-neutral-300 hover:text-red-500 transition-colors">Remove exercise</button>
      </div>
      {dateOpen && (
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => { if (e.target.value) { setDate(e.target.value); setDraft(null); } }}
          className="mt-2 w-full rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-brand"
        />
      )}
    </div>
  );
}

function Stepper({ label, value, onChange, onStep, step, inputMode }: {
  label: string; value: string; onChange: (v: string) => void; onStep: (delta: number) => void; step: number; inputMode: 'decimal' | 'numeric';
}) {
  return (
    <div>
      <p className="text-3xs uppercase text-neutral-400 mb-1">{label}</p>
      <div className="flex items-stretch rounded-lg border border-border bg-neutral-50 overflow-hidden">
        <button onClick={() => onStep(-step)} className="w-10 flex-shrink-0 text-lg text-neutral-500 active:bg-neutral-200 transition-colors" aria-label={`Decrease ${label}`}>−</button>
        <input
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 bg-transparent text-center text-base font-medium py-2 outline-none"
        />
        <button onClick={() => onStep(step)} className="w-10 flex-shrink-0 text-lg text-neutral-500 active:bg-neutral-200 transition-colors" aria-label={`Increase ${label}`}>+</button>
      </div>
    </div>
  );
}

function shortDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en', { day: 'numeric', month: 'short' });
}

const METRICS: { key: Metric; label: string }[] = [
  { key: 'strength', label: 'Strength' },
  { key: 'weight', label: 'Weight' },
  { key: 'reps', label: 'Reps' },
];

const CW = 320, CH = 118;
const CP = { left: 34, right: 14, top: 14, bottom: 22 };

// Deliberately plain: one line, one dot per session, newest value labelled —
// built to answer "am I getting stronger?" and nothing else. Bodyweight-only
// exercises have no load to estimate from, so they open on Reps instead.
function MiniChart({ sessions, bodyweight }: { sessions: Session[]; bodyweight: boolean }) {
  const [metric, setMetric] = useState<Metric>(bodyweight ? 'reps' : 'strength');
  const recent = sessions.slice(-16);
  const values = recent.map((s) => (metric === 'strength' && s.e1rm === 0 ? s.best.reps : metricValue(s.best, metric)));
  const lo0 = Math.min(...values), hi0 = Math.max(...values);
  const span = Math.max(hi0 - lo0, hi0 * 0.04, 1);
  const lo = lo0 - span * 0.25, hi = hi0 + span * 0.25;

  const t = recent.map((s) => new Date(s.date + 'T00:00:00').getTime());
  const t0 = t[0], t1 = t[t.length - 1];
  const iw = CW - CP.left - CP.right, ih = CH - CP.top - CP.bottom;
  const x = (i: number) => (recent.length === 1 ? CP.left + iw / 2 : CP.left + (t1 === t0 ? i / (recent.length - 1) : (t[i] - t0) / (t1 - t0)) * iw);
  const y = (v: number) => CP.top + (1 - (v - lo) / (hi - lo)) * ih;

  const line = recent.map((_, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(values[i]).toFixed(1)}`).join(' ');
  const area = recent.length > 1 ? `${line} L${x(recent.length - 1).toFixed(1)} ${CH - CP.bottom} L${x(0).toFixed(1)} ${CH - CP.bottom} Z` : '';
  const unit = metric === 'reps' || (metric === 'strength' && bodyweight) ? 'reps' : 'kg';
  const fmt = (v: number) => String(round1(v));

  return (
    <div>
      <p className="text-3xs uppercase text-neutral-400 mb-1.5">{metric === 'strength' ? `Estimated strength (${unit})` : metric === 'weight' ? 'Weight (kg)' : 'Reps'}</p>
      <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" role="img" aria-label="Progress over time">
        <line x1={CP.left} y1={CH - CP.bottom} x2={CW - CP.right} y2={CH - CP.bottom} stroke="var(--border)" strokeWidth={1} />
        <text x={CP.left - 6} y={y(hi0) + 3} textAnchor="end" className="fill-neutral-400" fontSize={9}>{fmt(hi0)}</text>
        {hi0 !== lo0 && <text x={CP.left - 6} y={y(lo0) + 3} textAnchor="end" className="fill-neutral-400" fontSize={9}>{fmt(lo0)}</text>}
        {area && <path d={area} fill="var(--brand)" opacity={0.1} />}
        {recent.length > 1 && <path d={line} fill="none" stroke="var(--brand)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
        {recent.map((s, i) => {
          const isLast = i === recent.length - 1;
          return (
            <circle
              key={s.date}
              cx={x(i)} cy={y(values[i])} r={isLast ? 4.5 : 3}
              fill={s.isPR ? 'var(--rank-gold)' : 'var(--brand)'} stroke="white" strokeWidth={1.5}
            />
          );
        })}
        {recent.length > 0 && (
          <text x={x(recent.length - 1)} y={y(values[values.length - 1]) - 9} textAnchor={recent.length > 1 ? 'end' : 'middle'} className="fill-neutral-600" fontSize={10} fontWeight={600}>
            {fmt(values[values.length - 1])}
          </text>
        )}
        <text x={recent.length === 1 ? CW / 2 : CP.left} y={CH - 7} textAnchor={recent.length === 1 ? 'middle' : 'start'} className="fill-neutral-400" fontSize={9}>{shortDate(recent[0].date)}</text>
        {recent.length > 1 && <text x={CW - CP.right} y={CH - 7} textAnchor="end" className="fill-neutral-400" fontSize={9}>{shortDate(recent[recent.length - 1].date)}</text>}
      </svg>
      {recent.length === 1 && <p className="text-2xs text-neutral-400 text-center -mt-1">Log this again next session to see your trend.</p>}
      <div className="grid grid-cols-3 rounded-full bg-neutral-100 p-0.5 mt-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`rounded-full py-1 text-2xs font-medium whitespace-nowrap transition-colors ${metric === m.key ? 'bg-surface text-brand-dark shadow-sm' : 'text-neutral-400'}`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
