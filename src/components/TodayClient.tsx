'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { localDateStr, addDays } from '@/lib/date';
import LoadingScreen from '@/components/LoadingScreen';
import { computeDayRank, RANK_META, type Rank } from '@/lib/ranking';
import { computeMicroTotals } from '@/lib/micronutrients';
import MicronutrientPanel from '@/components/MicronutrientPanel';
import type { Database } from '@/lib/supabase/database.types';

type Meal = Database['public']['Tables']['food_log_entries']['Row'];
type Habit = Database['public']['Tables']['habits']['Row'];
type Targets = Database['public']['Tables']['targets']['Row'];

type ChatMsg = { role: 'user' | 'bot'; text: string; id: string };

const DEFAULT_TARGETS = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };

export default function TodayClient() {
  const supabase = createClient();
  const [today] = useState(() => localDateStr());
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [targets, setTargets] = useState<Pick<Targets, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>>(DEFAULT_TARGETS);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [doneHabitIds, setDoneHabitIds] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState(0);
  const [rankOverride, setRankOverride] = useState<Rank | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [profileRes, targetsRes, mealsRes, habitsRes, completionsRes, overrideRes] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase.from('targets').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('food_log_entries').select('*').eq('user_id', user.id).eq('date', today).order('logged_at', { ascending: true }),
      supabase.from('habits').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }),
      supabase.from('habit_completions').select('habit_id').eq('user_id', user.id).eq('date', today).eq('completed', true),
      supabase.from('rank_overrides').select('rank').eq('user_id', user.id).eq('date', today).maybeSingle(),
    ]);

    setFullName(profileRes.data?.full_name || '');
    if (targetsRes.data) setTargets(targetsRes.data);
    else await supabase.from('targets').insert({ user_id: user.id, ...DEFAULT_TARGETS, updated_by: 'client' });
    setMeals(mealsRes.data || []);
    setHabits(habitsRes.data || []);
    setDoneHabitIds(new Set((completionsRes.data || []).map((c) => c.habit_id)));
    setRankOverride(overrideRes.data?.rank ?? null);

    // streak: walk back from today while both a meal and a completed habit exist for the day
    const windowStart = addDays(today, -90);
    const [mealDatesRes, habitDatesRes] = await Promise.all([
      supabase.from('food_log_entries').select('date').eq('user_id', user.id).gte('date', windowStart).lte('date', today),
      supabase.from('habit_completions').select('date').eq('user_id', user.id).eq('completed', true).gte('date', windowStart).lte('date', today),
    ]);
    const mealDates = new Set((mealDatesRes.data || []).map((r) => r.date));
    const habitDates = new Set((habitDatesRes.data || []).map((r) => r.date));
    let s = 0, cursor = today;
    while (mealDates.has(cursor) && habitDates.has(cursor)) { s++; cursor = addDays(cursor, -1); }
    setStreak(s);

    setLoading(false);
  }, [supabase, today]);

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
    load();
  }

  const totals = meals.reduce((a, m) => ({ cal: a.cal + m.calories, prot: a.prot + m.protein_g, carb: a.carb + m.carbs_g, fat: a.fat + m.fat_g }), { cal: 0, prot: 0, carb: 0, fat: 0 });
  const calPct = Math.min(100, Math.round((totals.cal / (targets.calories || 1)) * 100));
  const microTotals = computeMicroTotals(meals);
  const firstName = fullName.trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
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
      <div className="bg-brand rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between mb-1">
          <p className="text-xs text-white/70">{greeting}</p>
          <span className={`text-xs font-medium rounded-full px-2 py-1 border border-white/20 bg-white/10`}>
            {RANK_META[rank].emoji} {RANK_META[rank].label}
          </span>
        </div>
        <p className="text-2xl font-medium mb-3">{firstName}</p>
        <div className="flex gap-6">
          <div><div className="text-xl font-medium">{streak}</div><div className="text-[10px] uppercase text-white/50">Streak</div></div>
          <div><div className="text-xl font-medium">{doneHabitIds.size}/{habits.length}</div><div className="text-[10px] uppercase text-white/50">Habits today</div></div>
          <div><div className="text-xl font-medium">{Math.round(totals.cal)}</div><div className="text-[10px] uppercase text-white/50">Kcal logged</div></div>
        </div>
      </div>

      {/* Vitto chat */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Image src="/vitto-avatar.png" alt="" width={32} height={32} className="rounded-full bg-brand-light flex-shrink-0" />
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
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
            placeholder="Add whatever you want to log..."
            className="flex-1 min-w-0 rounded-full border border-border bg-neutral-50 px-4 py-2 text-sm outline-none focus:border-brand transition-colors"
          />
          <button onClick={sendChat} disabled={sending} className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center disabled:opacity-50 transition-transform active:scale-95">➤</button>
        </div>
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
