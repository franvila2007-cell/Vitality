'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { localDateStr, addDays } from '@/lib/date';
import LoadingScreen from '@/components/LoadingScreen';
import { computeDayRank, RANK_META, type Rank } from '@/lib/ranking';
import { computeMicroTotals, MICRONUTRIENT_KEYS, type MicronutrientKey } from '@/lib/micronutrients';
import MicronutrientPanel from '@/components/MicronutrientPanel';
import BarcodeScanner from '@/components/BarcodeScanner';
import type { Database } from '@/lib/supabase/database.types';

type Meal = Database['public']['Tables']['food_log_entries']['Row'];
type Habit = Database['public']['Tables']['habits']['Row'];
type Targets = Database['public']['Tables']['targets']['Row'];

type ChatMsg = { role: 'user' | 'bot'; text: string; id: string };

type BarcodeProduct = {
  name: string;
  brand: string | null;
  quantity: string | null;
  imageUrl: string | null;
  qualityScore: number | null;
  per100g: { calories: number; protein_g: number; carbs_g: number; fat_g: number } & Record<MicronutrientKey, number | null>;
};

const DEFAULT_TARGETS = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };

export default function TodayClient() {
  // Memoized once, not recreated every render — createClient() returns a
  // fresh instance each call, and referencing that directly in useCallback
  // dependency arrays (load/refreshStreak below) made those callbacks change
  // identity on every render, which retriggered their effects, which set
  // state, which re-rendered, forever. Found while auditing for jank.
  const [supabase] = useState(() => createClient());
  const [today] = useState(() => localDateStr());
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [targets, setTargets] = useState<Pick<Targets, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>>(DEFAULT_TARGETS);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [doneHabitIds, setDoneHabitIds] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState(0);
  const [weekHistory, setWeekHistory] = useState<{ date: string; hit: boolean }[]>([]);
  const [rankOverride, setRankOverride] = useState<Rank | null>(null);
  const [coachNote, setCoachNote] = useState('');
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedProduct, setScannedProduct] = useState<BarcodeProduct | null>(null);
  const [scanGrams, setScanGrams] = useState('100');
  const [logging, setLogging] = useState(false);

  // Isolated from load() below so toggling a habit only refetches the ~90
  // days of dates the streak actually depends on, instead of re-running the
  // full page load (profile/targets/meals/habits/completions) for a change
  // that only affects one number.
  const refreshStreak = useCallback(async (userId: string) => {
    const windowStart = addDays(today, -90);
    const [mealDatesRes, habitDatesRes] = await Promise.all([
      supabase.from('food_log_entries').select('date').eq('user_id', userId).gte('date', windowStart).lte('date', today),
      supabase.from('habit_completions').select('date').eq('user_id', userId).eq('completed', true).gte('date', windowStart).lte('date', today),
    ]);
    const mealDates = new Set((mealDatesRes.data || []).map((r) => r.date));
    const habitDates = new Set((habitDatesRes.data || []).map((r) => r.date));
    let s = 0, cursor = today;
    while (mealDates.has(cursor) && habitDates.has(cursor)) { s++; cursor = addDays(cursor, -1); }
    setStreak(s);

    // Same underlying data, just the last 7 days instead of walking back
    // until the streak breaks — for the week-at-a-glance bar.
    const week: { date: string; hit: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      week.push({ date: d, hit: mealDates.has(d) && habitDates.has(d) });
    }
    setWeekHistory(week);
  }, [supabase, today]);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // All independent of each other — fired together instead of the streak
    // window waiting on the first batch to resolve first.
    const [profileRes, clientProfileRes, targetsRes, mealsRes, habitsRes, completionsRes, overrideRes] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase.from('client_profiles').select('coach_note').eq('user_id', user.id).maybeSingle(),
      supabase.from('targets').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('food_log_entries').select('*').eq('user_id', user.id).eq('date', today).order('logged_at', { ascending: true }),
      supabase.from('habits').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }),
      supabase.from('habit_completions').select('habit_id').eq('user_id', user.id).eq('date', today).eq('completed', true),
      supabase.from('rank_overrides').select('rank').eq('user_id', user.id).eq('date', today).maybeSingle(),
      refreshStreak(user.id),
    ]);

    setFullName(profileRes.data?.full_name || '');
    setCoachNote(clientProfileRes.data?.coach_note || '');
    if (targetsRes.data) setTargets(targetsRes.data);
    else await supabase.from('targets').insert({ user_id: user.id, ...DEFAULT_TARGETS, updated_by: 'client' });
    setMeals(mealsRes.data || []);
    setHabits(habitsRes.data || []);
    setDoneHabitIds(new Set((completionsRes.data || []).map((c) => c.habit_id)));
    setRankOverride(overrideRes.data?.rank ?? null);
    setLoading(false);
  }, [supabase, today, refreshStreak]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (chat.length === 0) {
      setChat([{ id: 'greet', role: 'bot', text: "Hi, I'm Vitto! 👋 Tell me what you ate and I'll estimate the macros and log it — you can also ask things like \"how many calories do I have left?\" or say \"undo\"." }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat, sending]);

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || sending) return;
    setChatInput('');
    setChat((c) => [...c, { id: 'u' + Date.now(), role: 'user', text }]);
    setSending(true);
    try {
      const res = await fetch('/api/vitto/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, date: today }),
      });
      const data = await res.json();
      setChat((c) => [...c, { id: 'b' + Date.now(), role: 'bot', text: data.reply || "Sorry, something went wrong." }]);
      if (data.meals) setMeals(data.meals);
    } catch {
      setChat((c) => [...c, { id: 'e' + Date.now(), role: 'bot', text: "I couldn't reach the server just now — try again in a moment." }]);
    }
    setSending(false);
  }

  async function deleteMeal(id: string) {
    setMeals((m) => m.filter((x) => x.id !== id));
    await supabase.from('food_log_entries').delete().eq('id', id);
  }

  async function toggleHabit(habitId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const isDone = doneHabitIds.has(habitId);
    const next = new Set(doneHabitIds);
    if (isDone) next.delete(habitId); else next.add(habitId);
    setDoneHabitIds(next);
    await supabase.from('habit_completions').upsert(
      { user_id: user.id, habit_id: habitId, date: today, completed: !isDone },
      { onConflict: 'user_id,habit_id,date' }
    );
    refreshStreak(user.id);
  }

  async function handleBarcodeDetected(code: string) {
    setScanning(false);
    setScanLoading(true);
    setScanError(null);
    try {
      const res = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      setScannedProduct(data);
      setScanGrams('100');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Lookup failed.');
    }
    setScanLoading(false);
  }

  async function confirmBarcodeLog() {
    if (!scannedProduct) return;
    const grams = parseFloat(scanGrams);
    if (!grams || grams <= 0) return;
    setLogging(true);
    const factor = grams / 100;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLogging(false); return; }

    const p = scannedProduct.per100g;
    const scaledMicros = Object.fromEntries(
      MICRONUTRIENT_KEYS.map((k) => [k, p[k] == null ? null : Math.round(p[k]! * factor * 10) / 10])
    ) as Record<MicronutrientKey, number | null>;

    const { error } = await supabase.from('food_log_entries').insert({
      user_id: user.id, date: today,
      name: scannedProduct.brand ? `${scannedProduct.name} (${scannedProduct.brand})` : scannedProduct.name,
      calories: Math.round(p.calories * factor), protein_g: Math.round(p.protein_g * factor * 10) / 10,
      carbs_g: Math.round(p.carbs_g * factor * 10) / 10, fat_g: Math.round(p.fat_g * factor * 10) / 10,
      amount: grams, unit: 'g', source: 'manual', estimated: false,
      quality_score: scannedProduct.qualityScore,
      ...scaledMicros,
    });
    setLogging(false);
    if (!error) {
      setScannedProduct(null);
      load();
    }
  }

  const totals = meals.reduce((a, m) => ({ cal: a.cal + m.calories, prot: a.prot + m.protein_g, carb: a.carb + m.carbs_g, fat: a.fat + m.fat_g }), { cal: 0, prot: 0, carb: 0, fat: 0 });
  const calPct = Math.min(100, Math.round((totals.cal / (targets.calories || 1)) * 100));
  const microTotals = computeMicroTotals(meals);
  const firstName = fullName.trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greetingEmoji = hour < 17 ? '☀️' : '🌙';
  const rank = rankOverride ?? computeDayRank({
    habitsTotal: habits.length,
    habitsDone: doneHabitIds.size,
    meals: meals.map((m) => ({ calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, quality_score: m.quality_score })),
    targets,
  }).rank;

  if (loading) return <LoadingScreen />;

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">
      {/* Welcome card */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 100%)' }}
      >
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-8 w-32 h-32 rounded-full bg-black/10 blur-2xl pointer-events-none" />

        <div className="relative flex items-start justify-between mb-1">
          <p className="text-xs text-white/70">{greeting} {greetingEmoji}</p>
          <span className="text-xs font-medium rounded-full px-2.5 py-1 border border-white/20 bg-white/10 flex items-center gap-1" title={rankOverride ? 'Confirmed by your coach' : "Auto — your coach confirms your final rank at day's end"}>
            {RANK_META[rank].emoji} {RANK_META[rank].label}
            {!rankOverride && <span className="text-white/60 font-normal">· auto</span>}
          </span>
        </div>
        <p className="relative text-2xl font-medium mb-4">{firstName}</p>
        <div className="relative flex gap-6 mb-4">
          <div>
            <div className="text-xl font-medium flex items-center gap-1"><span className="text-base">🔥</span>{streak}</div>
            <div className="text-[10px] uppercase text-white/50 mt-0.5">Streak</div>
          </div>
          <div>
            <div className="text-xl font-medium flex items-center gap-1"><span className="text-base">✅</span>{doneHabitIds.size}/{habits.length}</div>
            <div className="text-[10px] uppercase text-white/50 mt-0.5">Habits today</div>
          </div>
          <div>
            <div className="text-xl font-medium flex items-center gap-1"><span className="text-base">🍽️</span>{Math.round(totals.cal)}</div>
            <div className="text-[10px] uppercase text-white/50 mt-0.5">Kcal logged</div>
          </div>
        </div>

        {/* This week */}
        <div className="relative border-t border-white/15 pt-3">
          <p className="text-[10px] uppercase text-white/50 mb-1.5">This week</p>
          <div className="flex gap-1.5">
            {weekHistory.map(({ date, hit }) => {
              const [y, m, d] = date.split('-').map(Number);
              const label = new Date(y, m - 1, d).toLocaleDateString('en', { weekday: 'narrow' });
              const isToday = date === today;
              return (
                <div key={date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full aspect-square rounded-lg flex items-center justify-center text-xs ${
                      hit ? 'bg-white text-brand-dark font-medium' : isToday ? 'border border-white/40 text-white/60' : 'bg-white/10 text-white/30'
                    }`}
                  >
                    {hit ? '✓' : ''}
                  </div>
                  <span className={`text-[9px] ${isToday ? 'text-white' : 'text-white/40'}`}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Vitto chat */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <Image src="/vitto-avatar.png" alt="" width={56} height={56} className="flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Vitto</p>
            <p className="text-[11px] text-neutral-400">Your Vitality AI food logger</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 mb-3 max-h-72 overflow-y-auto">
          {chat.map((m) => (
            <div key={m.id} className={`flex items-end gap-1.5 animate-[fade-in_0.15s_ease] ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'bot' && <Image src="/vitto-avatar.png" alt="" width={20} height={20} className="rounded-full flex-shrink-0" />}
              <div className={`px-3 py-2 rounded-2xl text-[13px] max-w-[85%] ${m.role === 'user' ? 'bg-brand text-white rounded-br-sm' : 'bg-neutral-100 text-neutral-800 rounded-bl-sm'}`}>
                {m.text}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex items-end gap-1.5 justify-start">
              <Image src="/vitto-avatar.png" alt="" width={20} height={20} className="rounded-full flex-shrink-0" />
              <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-neutral-100 text-neutral-400 text-[13px] flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setScanError(null); setScanning(true); }}
            title="Scan a barcode"
            className="w-10 h-10 flex-shrink-0 rounded-full border border-border text-neutral-500 flex items-center justify-center transition-transform active:scale-95 hover:text-neutral-800"
          >
            ▤
          </button>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
            placeholder="Add whatever you want to log..."
            className="flex-1 min-w-0 rounded-full border border-border bg-neutral-50 px-4 py-2 text-sm outline-none focus:border-brand transition-colors"
          />
          <button onClick={sendChat} disabled={sending} className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center disabled:opacity-50 transition-transform active:scale-95">➤</button>
        </div>
        {scanLoading && <p className="text-xs text-neutral-400 mt-2">Looking up that barcode…</p>}
        {scanError && <p className="text-xs text-red-500 mt-2">{scanError}</p>}
      </div>

      {/* Macro tracker */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-xs text-neutral-400 mb-3">Daily targets: {targets.calories} kcal · {targets.protein_g}p / {targets.carbs_g}c / {targets.fat_g}f</p>
        <div className="flex items-center gap-5 mb-4">
          <div className="relative w-24 h-24 rounded-full flex items-center justify-center" style={{ background: `conic-gradient(var(--brand) ${calPct * 3.6}deg, #eee 0deg)` }}>
            <div className="absolute inset-2 bg-surface rounded-full flex flex-col items-center justify-center">
              <span className="text-lg font-medium">{Math.round(totals.cal)}</span>
              <span className="text-[10px] text-neutral-400">/ {targets.calories} kcal</span>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <MacroBar label="Protein" value={totals.prot} target={targets.protein_g} color="#0FA8A6" />
            <MacroBar label="Carbs" value={totals.carb} target={targets.carbs_g} color="#2D7DD2" />
            <MacroBar label="Fats" value={totals.fat} target={targets.fat_g} color="#D4692A" />
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium text-neutral-500 mb-2">Meal log · {meals.length} {meals.length === 1 ? 'entry' : 'entries'}</p>
          {meals.length === 0 && <p className="text-sm text-neutral-400 text-center py-3">No meals logged yet.</p>}
          <div className="flex flex-col gap-1.5">
            {meals.map((m) => (
              <div key={m.id} className="flex items-center gap-2 bg-neutral-50 rounded-lg px-3 py-2">
                <span className="flex-1 min-w-0 text-sm truncate">{m.name}</span>
                <span className="flex-shrink-0 text-[11px] text-neutral-400 whitespace-nowrap">{Math.round(m.calories)} kcal · {Math.round(m.protein_g)}p {Math.round(m.carbs_g)}c {Math.round(m.fat_g)}f</span>
                <button onClick={() => deleteMeal(m.id)} className="flex-shrink-0 text-neutral-300 hover:text-red-500 text-sm transition-colors">✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Micronutrients */}
      <details className="bg-surface border border-border rounded-2xl p-4 group">
        <summary className="text-sm font-medium cursor-pointer list-none flex items-center justify-between [&::-webkit-details-marker]:hidden">
          Micronutrients
          <span className="text-neutral-400 text-xs group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="mt-3">
          <MicronutrientPanel totals={microTotals} hasAnyData={meals.some((m) => m.quality_score != null)} />
        </div>
      </details>

      {/* Habits */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-medium mb-3">Today&rsquo;s habits</p>
        {habits.length === 0 && <p className="text-sm text-neutral-400">No habits set up yet — your coach can add these.</p>}
        <div className="flex flex-col gap-2">
          {habits.map((h) => {
            const done = doneHabitIds.has(h.id);
            return (
              <button
                key={h.id}
                onClick={() => toggleHabit(h.id)}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm ${done ? 'bg-brand-light border-brand text-brand-dark' : 'border-border text-neutral-700'}`}
              >
                <span className={`w-5 h-5 rounded-md flex items-center justify-center text-xs flex-shrink-0 ${done ? 'bg-brand text-white' : 'border border-neutral-300'}`}>{done ? '✓' : ''}</span>
                <span className={done ? 'line-through opacity-75' : ''}>{h.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Note from your coach */}
      {coachNote && (
        <div className="bg-brand-light border border-brand/20 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wide text-brand-dark/60 mb-1.5">A note from your coach</p>
          <p className="text-sm text-brand-dark leading-relaxed">{coachNote}</p>
        </div>
      )}

      {scanning && <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setScanning(false)} />}

      {scannedProduct && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface rounded-2xl p-4 w-full max-w-sm">
            <div className="flex items-start gap-3 mb-3">
              {scannedProduct.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scannedProduct.imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-neutral-100" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{scannedProduct.name}</p>
                {scannedProduct.brand && <p className="text-xs text-neutral-400 truncate">{scannedProduct.brand}</p>}
              </div>
            </div>
            <label className="flex items-center gap-2 mb-3">
              <span className="text-xs text-neutral-500 flex-shrink-0">Amount (g)</span>
              <input
                type="number" value={scanGrams} onChange={(e) => setScanGrams(e.target.value)}
                className="flex-1 min-w-0 rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
              />
            </label>
            <p className="text-xs text-neutral-400 mb-3">
              {Math.round(scannedProduct.per100g.calories * ((parseFloat(scanGrams) || 0) / 100))} kcal ·{' '}
              {Math.round(scannedProduct.per100g.protein_g * ((parseFloat(scanGrams) || 0) / 100))}p{' '}
              {Math.round(scannedProduct.per100g.carbs_g * ((parseFloat(scanGrams) || 0) / 100))}c{' '}
              {Math.round(scannedProduct.per100g.fat_g * ((parseFloat(scanGrams) || 0) / 100))}f
            </p>
            <div className="flex gap-2">
              <button onClick={() => setScannedProduct(null)} className="flex-1 rounded-lg border border-border text-neutral-600 py-2 text-sm font-medium">Cancel</button>
              <button onClick={confirmBarcodeLog} disabled={logging} className="flex-1 rounded-lg bg-brand text-white py-2 text-sm font-medium disabled:opacity-50">
                {logging ? 'Logging…' : 'Log it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = Math.min(100, Math.round((value / (target || 1)) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-xs text-neutral-500 w-14 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] text-neutral-600 w-16 text-right flex-shrink-0">{Math.round(value)}/{target}g</span>
    </div>
  );
}
