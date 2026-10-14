'use client';

// The card under Vitto's reply when something was logged: each item with its
// macros and a − / + stepper to fix the portion in a tap (no typing "actually
// 2…"), a ✕ to drop it, and today's running total underneath.

export type LoggedItem = {
  id: string; name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number;
  amount: number | null; unit: string | null; matched_food: string | null; estimated: boolean; removed?: boolean;
};

const measured = (unit: string | null) => unit === 'g' || unit === 'ml';

/** Sensible nudge size for a quantity: 5–50 for grams/ml, 1 (or ½ below one) for counts. */
export function stepFor(amount: number, unit: string | null): number {
  if (measured(unit)) return amount >= 300 ? 50 : amount >= 100 ? 25 : amount >= 40 ? 10 : 5;
  return amount < 1 ? 0.5 : 1;
}

export function nextAmount(amount: number, unit: string | null, dir: 1 | -1): number {
  const step = stepFor(amount, unit);
  const next = Math.round((amount + dir * step) * 100) / 100;
  return Math.max(step, next);
}

const fmtAmount = (amount: number, unit: string | null) => (measured(unit) ? `${Math.round(amount * 10) / 10}${unit}` : `×${Math.round(amount * 100) / 100}`);

export default function LoggedMealCard({ items, leftCal, onChange, onRemove, onUndoAll }: {
  items: LoggedItem[];
  /** calories left of today's target right now (negative = over) */
  leftCal: number;
  onChange: (id: string, amount: number) => void;
  onRemove: (id: string) => void;
  onUndoAll: () => void;
}) {
  const live = items.filter((i) => !i.removed);
  if (live.length === 0) return <p className="mt-1.5 text-2xs text-neutral-400 pl-1">Removed from today&rsquo;s log.</p>;
  const total = live.reduce((a, i) => a + i.calories, 0);

  return (
    <div className="mt-1.5 rounded-2xl border border-border bg-white p-2 flex flex-col gap-1">
      {live.map((it) => (
        <div key={it.id} className="flex items-center gap-1.5 rounded-xl bg-neutral-50 px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{it.name}{it.estimated && <span className="text-neutral-400 font-normal"> · est.</span>}</p>
            <p className="text-3xs text-neutral-400 tabular-nums">{Math.round(it.calories)} kcal · {Math.round(it.protein_g)}p {Math.round(it.carbs_g)}c {Math.round(it.fat_g)}f</p>
          </div>
          {it.amount != null && it.amount > 0 && (
            <div className="flex items-center rounded-full border border-border bg-white flex-shrink-0">
              <button onClick={() => onChange(it.id, nextAmount(it.amount!, it.unit, -1))} aria-label={`Less ${it.name}`} className="w-7 h-7 text-neutral-500 text-base leading-none active:bg-neutral-100 rounded-l-full">−</button>
              <span className="min-w-[3.1rem] text-center text-2xs font-medium tabular-nums">{fmtAmount(it.amount, it.unit)}</span>
              <button onClick={() => onChange(it.id, nextAmount(it.amount!, it.unit, 1))} aria-label={`More ${it.name}`} className="w-7 h-7 text-neutral-500 text-base leading-none active:bg-neutral-100 rounded-r-full">+</button>
            </div>
          )}
          <button onClick={() => onRemove(it.id)} aria-label={`Remove ${it.name}`} className="w-6 h-6 flex-shrink-0 text-neutral-300 hover:text-red-500 text-sm">✕</button>
        </div>
      ))}
      <div className="flex items-center justify-between px-1 pt-0.5 text-3xs text-neutral-400">
        <span className="tabular-nums">
          {live.length > 1 ? `${Math.round(total)} kcal · ` : ''}{leftCal >= 0 ? `${Math.round(leftCal).toLocaleString('en-GB')} kcal left today` : `${Math.abs(Math.round(leftCal)).toLocaleString('en-GB')} kcal over today`}
        </span>
        <button onClick={onUndoAll} className="font-medium text-neutral-400 hover:text-red-500">Undo</button>
      </div>
    </div>
  );
}
