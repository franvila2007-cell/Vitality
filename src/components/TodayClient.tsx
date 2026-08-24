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

type PhotoItem = { label: string; cal: number; protein_g: number; carbs_g: number; fat_g: number; quality_score: number } & Record<MicronutrientKey, number>;

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
  const [weekHistory, setWeekHistory] = useState<{ date: string; rank: Rank | null }[]>([]);
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
  const [quickAdd, setQuickAdd] = useState<{ recipes: string[]; recent: string[] }>({ recipes: [], recent: [] });
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoItems, setPhotoItems] = useState<PhotoItem[] | null>(null);
  const [photoLogging, setPhotoLogging] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ name: '', calories: '', proteinG: '', carbsG: '', fatG: '' });
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualLogging, setManualLogging] = useState(false);

  // Isolated from load() below so toggling a habit only refetches the ~90
  // days of dates the streak actually depends on, instead of re-running the
  // full page load (profile/targets/meals/habits/completions) for a change
  // that only affects one number.
  const refreshStreak = useCallback(async (
    userId: string,
    habitsTotal: number,
    tgt: Pick<Targets, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>
  ) => {
    const windowStart = addDays(today, -90);
    const weekStart = addDays(today, -6);
    const [mealDatesRes, habitDatesRes, weekMealsRes, weekCompletionsRes, weekOverridesRes] = await Promise.all([
      supabase.from('food_log_entries').select('date').eq('user_id', userId).gte('date', windowStart).lte('date', today),
      supabase.from('habit_completions').select('date').eq('user_id', userId).eq('completed', true).gte('date', windowStart).lte('date', today),
      // Separate, week-scoped fetch with the actual macro/quality columns —
      // the two queries above only carry dates (enough for the streak's
      // hit/miss walk), but the week pips now show the real computed rank
      // for each day, which needs the same shape computeDayRank uses on the
      // coach dashboard.
      supabase.from('food_log_entries').select('date, calories, protein_g, carbs_g, fat_g, quality_score').eq('user_id', userId).gte('date', weekStart).lte('date', today),
      supabase.from('habit_completions').select('date').eq('user_id', userId).eq('completed', true).gte('date', weekStart).lte('date', today),
      supabase.from('rank_overrides').select('date, rank').eq('user_id', userId).gte('date', weekStart).lte('date', today),
    ]);
    const mealDates = new Set((mealDatesRes.data || []).map((r) => r.date));
    const habitDates = new Set((habitDatesRes.data || []).map((r) => r.date));
    let s = 0, cursor = today;
    while (mealDates.has(cursor) && habitDates.has(cursor)) { s++; cursor = addDays(cursor, -1); }
    setStreak(s);

    const weekMealsByDate = new Map<string, { calories: number; protein_g: number; carbs_g: number; fat_g: number; quality_score: number | null }[]>();
    for (const m of weekMealsRes.data || []) {
      const arr = weekMealsByDate.get(m.date) || [];
      arr.push(m);
      weekMealsByDate.set(m.date, arr);
    }
    const weekHabitsDoneByDate = new Map<string, number>();
    for (const row of weekCompletionsRes.data || []) {
      weekHabitsDoneByDate.set(row.date, (weekHabitsDoneByDate.get(row.date) ?? 0) + 1);
    }
    const weekOverrideByDate = new Map((weekOverridesRes.data || []).map((r) => [r.date, r.rank]));

    const week: { date: string; rank: Rank | null }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      const dayMeals = weekMealsByDate.get(d) || [];
      const hasData = dayMeals.length > 0 || weekHabitsDoneByDate.has(d) || weekOverrideByDate.has(d);
      if (!hasData) { week.push({ date: d, rank: null }); continue; }
      const rank = weekOverrideByDate.get(d) ?? computeDayRank({ habitsTotal, habitsDone: weekHabitsDoneByDate.get(d) ?? 0, meals: dayMeals, targets: tgt }).rank;
      week.push({ date: d, rank });
    }
    setWeekHistory(week);
  }, [supabase, today]);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // All independent of each other — fired together instead of the streak
    // window waiting on the first batch to resolve first.
    const [profileRes, clientProfileRes, targetsRes, mealsRes, habitsRes, completionsRes, overrideRes, recipesRes, recentRes] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase.from('client_profiles').select('coach_note').eq('user_id', user.id).maybeSingle(),
      supabase.from('targets').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('food_log_entries').select('*').eq('user_id', user.id).eq('date', today).order('logged_at', { ascending: true }),
      supabase.from('habits').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }),
      supabase.from('habit_completions').select('habit_id').eq('user_id', user.id).eq('date', today).eq('completed', true),
      supabase.from('rank_overrides').select('rank').eq('user_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('custom_foods').select('name').eq('user_id', user.id).order('name').limit(12),
      supabase.from('food_log_entries').select('name').eq('user_id', user.id).gte('date', addDays(today, -14)).order('logged_at', { ascending: false }).limit(60),
    ]);

    setFullName(profileRes.data?.full_name || '');
    setCoachNote(clientProfileRes.data?.coach_note || '');
    if (targetsRes.data) setTargets(targetsRes.data);
    else await supabase.from('targets').insert({ user_id: user.id, ...DEFAULT_TARGETS, updated_by: 'client' });
    setMeals(mealsRes.data || []);
    setHabits(habitsRes.data || []);
    setDoneHabitIds(new Set((completionsRes.data || []).map((c) => c.habit_id)));
    setRankOverride(overrideRes.data?.rank ?? null);

    const recipeNames = (recipesRes.data || []).map((r) => r.name);
    const recipeNamesLower = new Set(recipeNames.map((n) => n.toLowerCase()));
    const recentNames: string[] = [];
    const seen = new Set<string>();
    for (const row of recentRes.data || []) {
      const key = row.name.toLowerCase();
      // Skip anything already offered as a saved recipe chip, and cap at a
      // handful so this stays a quick row, not a second meal log.
      if (seen.has(key) || recipeNamesLower.has(key)) continue;
      seen.add(key);
      recentNames.push(row.name);
      if (recentNames.length >= 8) break;
    }
    setQuickAdd({ recipes: recipeNames, recent: recentNames });
    setLoading(false);
    refreshStreak(user.id, habitsRes.data?.length ?? 0, targetsRes.data || DEFAULT_TARGETS);
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

  // Shared by the text input and the quick-add chips — a chip tap is just a
  // shortcut for typing the food's name and hitting send, so it goes through
  // the exact same resolution (recipe/global-DB match, LLM fallback, quality
  // + micronutrient estimation) rather than a separate insert path.
  async function logText(text: string) {
    if (!text || sending) return;
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
      if (data.meals) {
        setMeals(data.meals);
        // Today's streak/week-pip depend on having a meal logged, and this
        // chat path is how most food actually gets logged — without this,
        // the welcome card's streak stays stale until a habit gets toggled.
        const { data: { user } } = await supabase.auth.getUser();
        if (user) refreshStreak(user.id, habits.length, targets);
      }
    } catch {
      setChat((c) => [...c, { id: 'e' + Date.now(), role: 'bot', text: "I couldn't reach the server just now — try again in a moment." }]);
    }
    setSending(false);
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    await logText(text);
  }

  // Chrome/Android ship this (prefixed); Safari/iOS ships neither — the
  // button below only renders where the check passes, so there's nothing to
  // click on unsupported browsers rather than a button that silently fails.
  // (iOS users still have a voice option: the keyboard's own dictation mic,
  // which works in this text field with no code needed here.)
  function toggleVoiceInput() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    setVoiceError(null);
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setChatInput(transcript);
    };
    recognition.onerror = (event) => {
      setVoiceError(event.error === 'not-allowed' ? 'Microphone access was denied.' : "Didn't catch that — try again or just type it.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  const PHOTO_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!PHOTO_ALLOWED_TYPES.has(file.type)) {
      setPhotoError('Unsupported image type — try a JPEG or PNG.');
      return;
    }
    setPhotoError(null);
    setPhotoLoading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/vitto/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not analyze that photo.');
      setPhotoItems(data.items);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not analyze that photo.');
    }
    setPhotoLoading(false);
  }

  function removePhotoItem(index: number) {
    setPhotoItems((items) => (items ? items.filter((_, i) => i !== index) : items));
  }

  async function confirmPhotoLog() {
    if (!photoItems || photoItems.length === 0) return;
    setPhotoLogging(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPhotoLogging(false); return; }

    const rows = photoItems.map((item) => {
      const micros = Object.fromEntries(MICRONUTRIENT_KEYS.map((k) => [k, item[k]])) as Record<MicronutrientKey, number>;
      return {
        user_id: user.id, date: today, name: item.label,
        calories: Math.round(item.cal), protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g,
        source: 'manual' as const, estimated: true, quality_score: item.quality_score,
        ...micros,
      };
    });
    const { error } = await supabase.from('food_log_entries').insert(rows);
    setPhotoLogging(false);
    if (!error) {
      setPhotoItems(null);
      load();
    }
  }

  async function confirmManualLog() {
    setManualError(null);
    const calories = parseFloat(manualForm.calories);
    const proteinG = parseFloat(manualForm.proteinG) || 0;
    const carbsG = parseFloat(manualForm.carbsG) || 0;
    const fatG = parseFloat(manualForm.fatG) || 0;
    if (!Number.isFinite(calories) || calories < 0) { setManualError('Enter at least the calories.'); return; }

    setManualLogging(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setManualLogging(false); return; }
    const { error } = await supabase.from('food_log_entries').insert({
      user_id: user.id, date: today, name: manualForm.name.trim() || 'Manual entry',
      calories, protein_g: proteinG, carbs_g: carbsG, fat_g: fatG,
      source: 'manual', estimated: false,
    });
    setManualLogging(false);
    if (error) { setManualError(error.message); return; }
    setManualOpen(false);
    setManualForm({ name: '', calories: '', proteinG: '', carbsG: '', fatG: '' });
    load();
  }

  async function deleteMeal(id: string) {
    setMeals((m) => m.filter((x) => x.id !== id));
    await supabase.from('food_log_entries').delete().eq('id', id);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) refreshStreak(user.id, habits.length, targets);
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
    refreshStreak(user.id, habits.length, targets);
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
        <p className="relative text-2xl font-medium mb-4">Welcome to Vitality, {firstName}</p>
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
            {weekHistory.map(({ date, rank }) => {
              const [y, m, d] = date.split('-').map(Number);
              const label = new Date(y, m - 1, d).toLocaleDateString('en', { weekday: 'narrow' });
              const isToday = date === today;
              // Colored solid, not a checkmark, so the pip itself shows
              // which rank the day landed on at a glance — gold/silver/
              // bronze use distinct saturated fills that read against the
              // teal card; a day with no data yet stays translucent (or
              // outlined, if it's today and just hasn't happened yet).
              const rankBg = rank === 'gold' ? 'bg-amber-400' : rank === 'silver' ? 'bg-zinc-300' : rank === 'bronze' ? 'bg-amber-800' : null;
              return (
                <div key={date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full aspect-square rounded-lg ${
                      rankBg ? `${rankBg} ${isToday ? 'ring-2 ring-white/70' : ''}` : isToday ? 'border border-white/40' : 'bg-white/10'
                    }`}
                    title={rank ? RANK_META[rank].label : isToday ? "Today — not ranked yet" : 'No data'}
                  />
                  <span className={`text-[9px] ${isToday ? 'text-white' : 'text-white/40'}`}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Vitto chat */}
      {/* min-w-0: without it, a flex-column child sizes to its widest
          descendant's natural width — the quick-add chip row below is wide
          enough (many chips) to blow out this card, and with it the whole
          page, into horizontal scroll on narrow screens instead of just
          scrolling internally as intended. */}
      <div className="bg-surface border border-border rounded-2xl p-4 min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <Image
            src="/vitto-avatar.png" alt="" width={56} height={56}
            className={`flex-shrink-0 rounded-full transition-shadow ${sending ? 'animate-[vitto-thinking-ring_1.2s_ease-in-out_infinite]' : 'animate-[vitto-bob_3s_ease-in-out_infinite]'}`}
          />
          <div>
            <p className="text-sm font-medium">Vitto</p>
            <p className="text-[11px] text-neutral-400">Your Vitality AI food logger</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 mb-3 max-h-72 overflow-y-auto">
          {chat.map((m) => (
            <div
              key={m.id}
              className={`flex items-end gap-1.5 ${m.role === 'user' ? 'justify-end animate-[fade-in_0.15s_ease]' : 'justify-start animate-[bubble-pop_0.35s_cubic-bezier(0.34,1.56,0.64,1)]'}`}
            >
              {m.role === 'bot' && <Image src="/vitto-avatar.png" alt="" width={20} height={20} className="rounded-full flex-shrink-0" />}
              <div className={`px-3 py-2 rounded-2xl text-[13px] max-w-[85%] ${m.role === 'user' ? 'bg-brand text-white rounded-br-sm' : 'bg-neutral-100 text-neutral-800 rounded-bl-sm'}`}>
                {m.text}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex items-end gap-1.5 justify-start animate-[fade-in_0.15s_ease]">
              <Image src="/vitto-avatar.png" alt="" width={20} height={20} className="rounded-full flex-shrink-0 animate-[vitto-bob_1s_ease-in-out_infinite]" />
              <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-neutral-100 text-neutral-400 text-[13px] flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        {(quickAdd.recipes.length > 0 || quickAdd.recent.length > 0) && (
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1 -mx-1 px-1">
            {quickAdd.recipes.map((name) => (
              <button
                key={'recipe-' + name}
                onClick={() => logText(name)}
                disabled={sending}
                className="flex-shrink-0 rounded-full border border-brand/30 bg-brand-light text-brand-dark text-xs font-medium px-3 py-1.5 whitespace-nowrap disabled:opacity-50 transition-transform active:scale-95"
              >
                📖 {name}
              </button>
            ))}
            {quickAdd.recent.map((name) => (
              <button
                key={'recent-' + name}
                onClick={() => logText(name)}
                disabled={sending}
                className="flex-shrink-0 rounded-full border border-border bg-neutral-50 text-neutral-600 text-xs font-medium px-3 py-1.5 whitespace-nowrap disabled:opacity-50 transition-transform active:scale-95"
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => { setScanError(null); setScanning(true); }}
            title="Scan a barcode"
            className="w-10 h-10 flex-shrink-0 rounded-full border border-border text-neutral-500 flex items-center justify-center transition-transform active:scale-95 hover:text-neutral-800"
          >
            ▤
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelected}
            className="hidden"
          />
          <button
            onClick={() => { setPhotoError(null); photoInputRef.current?.click(); }}
            disabled={photoLoading}
            title="Log from a photo"
            className="w-10 h-10 flex-shrink-0 rounded-full border border-border text-neutral-500 flex items-center justify-center transition-transform active:scale-95 hover:text-neutral-800 disabled:opacity-50"
          >
            {photoLoading ? '…' : '📷'}
          </button>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
            placeholder={listening ? 'Listening…' : 'Add whatever you want to log...'}
            className="flex-1 min-w-0 rounded-full border border-border bg-neutral-50 px-4 py-2 text-sm outline-none focus:border-brand transition-colors"
          />
          {typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition) && (
            <button
              onClick={toggleVoiceInput}
              title="Log by voice"
              className={`w-10 h-10 flex-shrink-0 rounded-full border flex items-center justify-center transition-transform active:scale-95 ${
                listening ? 'bg-red-500 border-red-500 text-white animate-pulse' : 'border-border text-neutral-500 hover:text-neutral-800'
              }`}
            >
              🎤
            </button>
          )}
          <button onClick={sendChat} disabled={sending} className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center disabled:opacity-50 transition-transform active:scale-95">➤</button>
        </div>
        {scanLoading && <p className="text-xs text-neutral-400 mt-2">Looking up that barcode…</p>}
        {scanError && <p className="text-xs text-red-500 mt-2">{scanError}</p>}
        {voiceError && <p className="text-xs text-red-500 mt-2">{voiceError}</p>}
        {photoLoading && <p className="text-xs text-neutral-400 mt-2">Looking at your photo…</p>}
        {photoError && <p className="text-xs text-red-500 mt-2">{photoError}</p>}
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
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-neutral-500">Meal log · {meals.length} {meals.length === 1 ? 'entry' : 'entries'}</p>
            <button
              onClick={() => { setManualError(null); setManualOpen(true); }}
              className="text-xs font-medium text-brand-dark hover:opacity-70 transition-opacity"
            >
              + Enter manually
            </button>
          </div>
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
          <p className="text-[10px] uppercase tracking-wide text-brand-dark/60 mb-1.5">A note from Francesco</p>
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

      {photoItems && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface rounded-2xl p-4 w-full max-w-sm max-h-[85vh] flex flex-col">
            <p className="text-sm font-medium mb-1">What Vitto saw</p>
            {photoItems.length === 0 && <p className="text-sm text-neutral-400 py-3">Couldn&rsquo;t make out any food in that photo. Try a clearer shot or log it by typing instead.</p>}
            <div className="flex flex-col gap-1.5 overflow-y-auto mb-3">
              {photoItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 bg-neutral-50 rounded-lg px-3 py-2">
                  <span className="flex-1 min-w-0 text-sm truncate">{item.label}</span>
                  <span className="flex-shrink-0 text-[11px] text-neutral-400 whitespace-nowrap">{Math.round(item.cal)} kcal · {Math.round(item.protein_g)}p {Math.round(item.carbs_g)}c {Math.round(item.fat_g)}f</span>
                  <button onClick={() => removePhotoItem(i)} className="flex-shrink-0 text-neutral-300 hover:text-red-500 text-sm transition-colors">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPhotoItems(null)} className="flex-1 rounded-lg border border-border text-neutral-600 py-2 text-sm font-medium">Cancel</button>
              {photoItems.length > 0 && (
                <button onClick={confirmPhotoLog} disabled={photoLogging} className="flex-1 rounded-lg bg-brand text-white py-2 text-sm font-medium disabled:opacity-50">
                  {photoLogging ? 'Logging…' : `Log all (${photoItems.length})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {manualOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface rounded-2xl p-4 w-full max-w-sm">
            <p className="text-sm font-medium mb-1">Enter it manually</p>
            <p className="text-xs text-neutral-400 mb-3">For when you already know the numbers — packaging, another app, a menu.</p>
            <div className="flex flex-col gap-2.5">
              <input
                value={manualForm.name}
                onChange={(e) => setManualForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="What was it? (optional)"
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand transition-colors"
              />
              <div className="grid grid-cols-4 gap-2">
                <ManualField label="Kcal" value={manualForm.calories} onChange={(v) => setManualForm((f) => ({ ...f, calories: v }))} />
                <ManualField label="Protein" value={manualForm.proteinG} onChange={(v) => setManualForm((f) => ({ ...f, proteinG: v }))} />
                <ManualField label="Carbs" value={manualForm.carbsG} onChange={(v) => setManualForm((f) => ({ ...f, carbsG: v }))} />
                <ManualField label="Fat" value={manualForm.fatG} onChange={(v) => setManualForm((f) => ({ ...f, fatG: v }))} />
              </div>
              {manualError && <p className="text-xs text-red-600">{manualError}</p>}
              <div className="flex gap-2 mt-1">
                <button onClick={() => setManualOpen(false)} className="flex-1 rounded-lg border border-border text-neutral-600 py-2 text-sm font-medium">Cancel</button>
                <button onClick={confirmManualLog} disabled={manualLogging} className="flex-1 rounded-lg bg-brand text-white py-2 text-sm font-medium disabled:opacity-50">
                  {manualLogging ? 'Logging…' : 'Log it'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ManualField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase text-neutral-400">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-neutral-50 px-2 py-1.5 text-sm outline-none focus:border-brand transition-colors"
      />
    </label>
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
