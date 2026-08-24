import Link from 'next/link';
import Image from 'next/image';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { localDateStr, addDays } from '@/lib/date';
import { computeDayRank, RANK_META } from '@/lib/ranking';
import { computeMicroTotals } from '@/lib/micronutrients';
import MicronutrientPanel from '@/components/MicronutrientPanel';

const DEFAULT_TARGETS = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };

// Coach-only, read-only mirror of the client's own Today page — same
// welcome card / macro ring / habit checklist a client sees, built from a
// server-side fetch scoped to their user_id instead of the session's own,
// so the coach can see exactly what a client sees without signing in as
// them (which would both risk mutating their data and blow away the
// coach's own session in the same browser).
export default async function ClientAppPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') redirect('/');

  const today = localDateStr();
  const weekStart = addDays(today, -6);

  const [profileRes, clientProfileRes, targetsRes, mealsRes, habitsRes, completionsRes, overrideRes, weekMealDatesRes, weekHabitDatesRes] = await Promise.all([
    supabase.from('profiles').select('full_name, email, role').eq('id', id).single(),
    supabase.from('client_profiles').select('coach_note').eq('user_id', id).maybeSingle(),
    supabase.from('targets').select('*').eq('user_id', id).maybeSingle(),
    supabase.from('food_log_entries').select('*').eq('user_id', id).eq('date', today).order('logged_at', { ascending: true }),
    supabase.from('habits').select('*').eq('user_id', id).order('sort_order', { ascending: true }),
    supabase.from('habit_completions').select('habit_id').eq('user_id', id).eq('date', today).eq('completed', true),
    supabase.from('rank_overrides').select('rank').eq('user_id', id).eq('date', today).maybeSingle(),
    supabase.from('food_log_entries').select('date').eq('user_id', id).gte('date', weekStart).lte('date', today),
    supabase.from('habit_completions').select('date').eq('user_id', id).eq('completed', true).gte('date', weekStart).lte('date', today),
  ]);

  if (profileRes.error || !profileRes.data || profileRes.data.role !== 'client') notFound();

  const targets = targetsRes.data || DEFAULT_TARGETS;
  const meals = mealsRes.data || [];
  const habits = habitsRes.data || [];
  const doneHabitIds = new Set((completionsRes.data || []).map((c) => c.habit_id));
  const mealDates = new Set((weekMealDatesRes.data || []).map((r) => r.date));
  const habitDates = new Set((weekHabitDatesRes.data || []).map((r) => r.date));
  const weekHistory = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, -(6 - i));
    return { date: d, hit: mealDates.has(d) && habitDates.has(d) };
  });
  let streak = 0;
  let cursor = today;
  while (mealDates.has(cursor) && habitDates.has(cursor)) { streak++; cursor = addDays(cursor, -1); }

  const totals = meals.reduce((a, m) => ({ cal: a.cal + m.calories, prot: a.prot + m.protein_g, carb: a.carb + m.carbs_g, fat: a.fat + m.fat_g }), { cal: 0, prot: 0, carb: 0, fat: 0 });
  const calPct = Math.min(100, Math.round((totals.cal / (targets.calories || 1)) * 100));
  const microTotals = computeMicroTotals(meals);
  const fullName = profileRes.data.full_name || profileRes.data.email;
  const firstName = fullName.trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greetingEmoji = hour < 17 ? '☀️' : '🌙';
  const rank = overrideRes.data?.rank ?? computeDayRank({
    habitsTotal: habits.length,
    habitsDone: doneHabitIds.size,
    meals: meals.map((m) => ({ calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, quality_score: m.quality_score })),
    targets,
  }).rank;

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-10 bg-surface border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href={`/coach/clients/${id}`} className="text-sm text-neutral-400 hover:text-neutral-700">&larr; {fullName}</Link>
          <span className="text-xs font-medium text-neutral-400 border border-border rounded-full px-2.5 py-1">👁 Read-only preview</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">
        <div className="relative overflow-hidden rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 100%)' }}>
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-8 w-32 h-32 rounded-full bg-black/10 blur-2xl pointer-events-none" />

          <div className="relative flex items-start justify-between mb-1">
            <p className="text-xs text-white/70">{greeting} {greetingEmoji}</p>
            <span className="text-xs font-medium rounded-full px-2.5 py-1 border border-white/20 bg-white/10 flex items-center gap-1">
              {RANK_META[rank].emoji} {RANK_META[rank].label}
              {!overrideRes.data && <span className="text-white/60 font-normal">· auto</span>}
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

          <div className="relative border-t border-white/15 pt-3">
            <p className="text-[10px] uppercase text-white/50 mb-1.5">This week</p>
            <div className="flex gap-1.5">
              {weekHistory.map(({ date, hit }) => {
                const [y, m, d] = date.split('-').map(Number);
                const label = new Date(y, m - 1, d).toLocaleDateString('en', { weekday: 'narrow' });
                const isToday = date === today;
                return (
                  <div key={date} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-full aspect-square rounded-lg flex items-center justify-center text-xs ${hit ? 'bg-white text-brand-dark font-medium' : isToday ? 'border border-white/40 text-white/60' : 'bg-white/10 text-white/30'}`}>
                      {hit ? '✓' : ''}
                    </div>
                    <span className={`text-[9px] ${isToday ? 'text-white' : 'text-white/40'}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-4 opacity-90">
          <div className="flex items-center gap-3 mb-3">
            <Image src="/vitto-avatar.png" alt="" width={56} height={56} className="flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Vitto</p>
              <p className="text-[11px] text-neutral-400">Their AI food logger — chat isn&rsquo;t shown here</p>
            </div>
          </div>
          <p className="text-xs text-neutral-400 bg-neutral-50 rounded-xl px-3 py-2.5">You&rsquo;re viewing a read-only snapshot — chat history and logging live only in {firstName}&rsquo;s own app.</p>
        </div>

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
                </div>
              ))}
            </div>
          </div>
        </div>

        <details className="bg-surface border border-border rounded-2xl p-4 group">
          <summary className="text-sm font-medium cursor-pointer list-none flex items-center justify-between [&::-webkit-details-marker]:hidden">
            Micronutrients
            <span className="text-neutral-400 text-xs group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="mt-3">
            <MicronutrientPanel totals={microTotals} hasAnyData={meals.some((m) => m.quality_score != null)} />
          </div>
        </details>

        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-sm font-medium mb-3">Today&rsquo;s habits</p>
          {habits.length === 0 && <p className="text-sm text-neutral-400">No habits set up yet.</p>}
          <div className="flex flex-col gap-2">
            {habits.map((h) => {
              const done = doneHabitIds.has(h.id);
              return (
                <div key={h.id} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm ${done ? 'bg-brand-light border-brand text-brand-dark' : 'border-border text-neutral-700'}`}>
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center text-xs flex-shrink-0 ${done ? 'bg-brand text-white' : 'border border-neutral-300'}`}>{done ? '✓' : ''}</span>
                  <span className={done ? 'line-through opacity-75' : ''}>{h.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {clientProfileRes.data?.coach_note && (
          <div className="bg-brand-light border border-brand/20 rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-wide text-brand-dark/60 mb-1.5">A note from Francesco</p>
            <p className="text-sm text-brand-dark leading-relaxed">{clientProfileRes.data.coach_note}</p>
          </div>
        )}
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
