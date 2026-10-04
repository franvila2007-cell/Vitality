'use client';

import { useEffect, useRef, useState } from 'react';
import VittoPlate from '@/components/VittoPlate';
import type { Macros, MealOption, Recommendation } from '@/lib/vitto/mealRecommender';

// Next-meal suggestion built from what's left of today's targets. The server
// returns a ranked shortlist in one call; "Find Another Meal" just steps
// through it locally, so it's instant.
export default function VittoRecommends({ remaining, hasLogged, date }: { remaining: Macros; hasLogged: boolean; date: string }) {
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [error, setError] = useState(false);
  const [idx, setIdx] = useState(0);
  const [fetchedKey, setFetchedKey] = useState('');
  const reqId = useRef(0);

  // Re-ask only when the numbers genuinely change (rounded, so a 0.3g drift
  // doesn't trigger a refetch); debounced so a burst of logs is one request.
  const cal = Math.round(remaining.cal / 10) * 10;
  const prot = Math.round(remaining.prot), carb = Math.round(remaining.carb), fat = Math.round(remaining.fat);

  const key = `${cal}|${prot}|${carb}|${fat}|${hasLogged}`;
  // Showing an answer for numbers that have since changed → dim it until the new one lands.
  const stale = fetchedKey !== key;

  useEffect(() => {
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/vitto/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remaining: { cal, prot, carb, fat }, hour: new Date().getHours(), date, hasLogged }),
        });
        if (!res.ok) throw new Error('bad status');
        const data = (await res.json()) as Recommendation;
        if (id !== reqId.current) return;
        setRec(data);
        setIdx(0);
        setError(false);
      } catch {
        if (id === reqId.current) setError(true);
      }
      if (id === reqId.current) setFetchedKey(key);
    }, 350);
    return () => clearTimeout(timer);
  }, [cal, prot, carb, fat, date, hasLogged, key]);

  const options = rec?.status === 'ok' ? rec.options : [];
  const option: MealOption | null = options.length > 0 ? options[idx % options.length] : null;

  return (
    <div className="relative overflow-clip rounded-2xl border border-brand/25 bg-gradient-to-br from-brand-light via-white to-white p-4">
      <div className="absolute -top-12 -right-10 w-36 h-36 rounded-full bg-brand/10 blur-2xl pointer-events-none" />

      <div className="relative flex items-center gap-2 mb-3">
        <VittoPlate size={92} className="flex-shrink-0 -ml-1" />
        <div className="min-w-0">
          <p className="text-3xs uppercase tracking-wide text-brand-dark/60 mb-0.5">Next meal</p>
          <p className="text-base font-medium text-brand-dark leading-tight">Vitto Recommends</p>
          <p className="text-xs text-neutral-500 mt-0.5">Based on what you&rsquo;ve eaten today</p>
        </div>
      </div>

      <div className="relative grid grid-cols-4 gap-1.5 mb-3">
        <Remaining label="Calories" value={Math.max(0, Math.round(remaining.cal))} unit="kcal" />
        <Remaining label="Protein" value={Math.max(0, Math.round(remaining.prot))} unit="g" color="var(--color-macro-protein)" />
        <Remaining label="Carbs" value={Math.max(0, Math.round(remaining.carb))} unit="g" color="var(--color-macro-carbs)" />
        <Remaining label="Fat" value={Math.max(0, Math.round(remaining.fat))} unit="g" color="var(--color-macro-fat)" />
      </div>
      <p className="relative text-3xs uppercase tracking-wide text-neutral-400 -mt-1.5 mb-3">Remaining today</p>

      {!rec && !error && <div className="h-36 rounded-xl bg-white/70 animate-pulse" />}

      {error && !rec && <p className="relative text-sm text-neutral-400 py-3">I couldn&rsquo;t come up with a suggestion just now — it&rsquo;ll retry as you log.</p>}

      {rec?.status === 'complete' && (
        <div className="relative rounded-xl bg-white border border-border p-3.5">
          <p className="text-sm text-neutral-700 leading-relaxed">{rec.message}</p>
        </div>
      )}

      {rec?.status === 'ok' && option && (
        <div className={`relative transition-opacity ${stale ? 'opacity-60' : ''}`}>
          <p className="text-xs text-neutral-500 mb-2">{rec.message}</p>
          {/* key: replays the settle-in when "Find Another Meal" swaps the meal */}
          <div key={option.id} className="rounded-xl bg-white border border-border p-3.5 animate-[fade-in_0.2s_ease]">
            <p className="text-[15px] font-medium mb-2">{option.name}</p>
            <ul className="flex flex-col gap-1 mb-3">
              {option.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-neutral-700">
                  <span className="mt-[7px] w-1 h-1 rounded-full bg-brand flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="border-t border-border pt-2.5">
              <p className="text-3xs uppercase tracking-wide text-neutral-400 mb-1">Estimated for this meal</p>
              <p className="text-sm font-medium">
                {option.macros.cal} kcal
                <span className="text-neutral-300 mx-1.5">·</span>
                <span style={{ color: 'var(--color-macro-protein)' }}>{option.macros.prot}p</span>{' '}
                <span style={{ color: 'var(--color-macro-carbs)' }}>{option.macros.carb}c</span>{' '}
                <span style={{ color: 'var(--color-macro-fat)' }}>{option.macros.fat}f</span>
              </p>
              <p className="text-2xs text-neutral-400 mt-1">{option.why}</p>
            </div>
          </div>
          {options.length > 1 && (
            <button
              onClick={() => setIdx((i) => (i + 1) % options.length)}
              className="mt-3 w-full rounded-lg bg-brand text-white py-2.5 text-sm font-medium transition-transform active:scale-[0.98]"
            >
              Find Another Meal
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Remaining({ label, value, unit, color }: { label: string; value: number; unit: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/80 border border-border px-2 py-2 text-center min-w-0">
      <div className="text-base font-medium leading-none" style={color ? { color } : undefined}>
        {value}<span className="text-3xs text-neutral-400 font-normal ml-0.5">{unit}</span>
      </div>
      <div className="text-3xs uppercase text-neutral-400 mt-1">{label}</div>
    </div>
  );
}
