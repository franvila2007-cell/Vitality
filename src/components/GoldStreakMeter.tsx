'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { localDateStr, addDays } from '@/lib/date';
import { computeDayRank } from '@/lib/ranking';

const DEFAULT_TARGETS = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };
const FULL_STREAK_DAYS = 14; // bar reads as "full" at a two-week gold streak
const WINDOW_DAYS = 60; // how far back to walk before giving up on an unbroken streak

// Same "hotter as it grows" idea as a real fire — each tier swaps in a
// warmer gradient and adds a glow once the streak earns it, rather than
// just scaling one flat color.
const TIERS = [
  { min: 0, barClass: 'bg-neutral-200', glowClass: '' },
  { min: 1, barClass: 'bg-gradient-to-r from-amber-300 to-amber-400', glowClass: '' },
  { min: 3, barClass: 'bg-gradient-to-r from-amber-400 via-orange-400 to-orange-500', glowClass: 'shadow-[0_0_10px_rgba(251,146,60,0.55)]' },
  { min: 7, barClass: 'bg-gradient-to-r from-orange-500 via-red-500 to-red-600', glowClass: 'shadow-[0_0_14px_rgba(239,68,68,0.6)]' },
  { min: FULL_STREAK_DAYS, barClass: 'bg-gradient-to-r from-red-600 via-orange-500 to-amber-300', glowClass: 'shadow-[0_0_18px_rgba(239,68,68,0.75)]' },
] as const;

function tierFor(streak: number) {
  let t: (typeof TIERS)[number] = TIERS[0];
  for (const tier of TIERS) if (streak >= tier.min) t = tier;
  return t;
}

export default function GoldStreakMeter() {
  const [supabase] = useState(() => createClient());
  const [streak, setStreak] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStreak(0); return; }

    const today = localDateStr();
    const windowStart = addDays(today, -WINDOW_DAYS);

    const [targetsRes, habitsRes, mealsRes, completionsRes, overridesRes] = await Promise.all([
      supabase.from('targets').select('calories, protein_g, carbs_g, fat_g').eq('user_id', user.id).maybeSingle(),
      supabase.from('habits').select('id').eq('user_id', user.id),
      supabase.from('food_log_entries').select('date, calories, protein_g, carbs_g, fat_g, quality_score').eq('user_id', user.id).gte('date', windowStart).lte('date', today),
      supabase.from('habit_completions').select('date').eq('user_id', user.id).eq('completed', true).gte('date', windowStart).lte('date', today),
      supabase.from('rank_overrides').select('date, rank').eq('user_id', user.id).gte('date', windowStart).lte('date', today),
    ]);

    const targets = targetsRes.data || DEFAULT_TARGETS;
    const habitsTotal = habitsRes.data?.length ?? 0;

    const mealsByDate = new Map<string, { calories: number; protein_g: number; carbs_g: number; fat_g: number; quality_score: number | null }[]>();
    for (const m of mealsRes.data || []) {
      const arr = mealsByDate.get(m.date) || [];
      arr.push(m);
      mealsByDate.set(m.date, arr);
    }
    const habitsDoneByDate = new Map<string, number>();
    for (const row of completionsRes.data || []) {
      habitsDoneByDate.set(row.date, (habitsDoneByDate.get(row.date) ?? 0) + 1);
    }
    const overrideByDate = new Map((overridesRes.data || []).map((r) => [r.date, r.rank]));

    let s = 0;
    let cursor = today;
    while (cursor >= windowStart) {
      const dayMeals = mealsByDate.get(cursor) || [];
      const hasData = dayMeals.length > 0 || habitsDoneByDate.has(cursor) || overrideByDate.has(cursor);
      if (!hasData) break;
      const rank = overrideByDate.get(cursor) ?? computeDayRank({ habitsTotal, habitsDone: habitsDoneByDate.get(cursor) ?? 0, meals: dayMeals, targets }).rank;
      if (rank !== 'gold') break;
      s++;
      cursor = addDays(cursor, -1);
    }
    setStreak(s);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  if (streak === null) {
    return <div className="rounded-card bg-neutral-100 h-[88px] animate-pulse" />;
  }

  const tier = tierFor(streak);
  const pct = streak === 0 ? 0 : Math.max(8, Math.min(100, Math.round((streak / FULL_STREAK_DAYS) * 100)));

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium">Gold streak</p>
        <span className="text-sm font-semibold flex items-center gap-1">
          <span className={streak > 0 ? 'animate-[flame-flicker_1.4s_ease-in-out_infinite]' : 'opacity-30'}>🔥</span>
          {streak}
        </span>
      </div>
      <div className="h-3 rounded-full bg-neutral-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${tier.barClass} ${tier.glowClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-2xs text-neutral-400 mt-1.5">
        {streak === 0
          ? 'Log a gold day to start your streak'
          : `${streak} day${streak === 1 ? '' : 's'} of gold in a row — keep it burning`}
      </p>
    </div>
  );
}
