import { MICRONUTRIENTS, MICRONUTRIENT_KEYS, type MicronutrientTotals } from '@/lib/micronutrients';

const GROUPS = ['Everyday', 'Minerals', 'Vitamins'] as const;

export default function MicronutrientPanel({ totals, hasAnyData }: { totals: MicronutrientTotals; hasAnyData: boolean }) {
  if (!hasAnyData) {
    return <p className="text-sm text-neutral-400">No micronutrient estimates yet — Vitto adds these when your AI fallback is available (needs an Anthropic API key configured).</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-neutral-400">Estimated by Vitto from food names/portions, not lab-measured — directional, not precise. % is of a general adult daily value.</p>
      {GROUPS.map((group) => (
        <div key={group}>
          <p className="text-[10px] uppercase text-neutral-400 mb-1.5">{group}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MICRONUTRIENT_KEYS.filter((k) => MICRONUTRIENTS[k].group === group).map((key) => {
              const meta = MICRONUTRIENTS[key];
              const value = totals[key];
              const pct = Math.min(100, Math.round((value / meta.dailyValue) * 100));
              return (
                <div key={key} className="bg-neutral-50 rounded-lg px-2.5 py-2">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-xs text-neutral-600 truncate">{meta.label}</span>
                    <span className="text-[10px] text-neutral-400 flex-shrink-0">{pct}%</span>
                  </div>
                  <div className="text-sm font-medium mb-1">{Math.round(value * 10) / 10}{meta.unit}</div>
                  <div className="h-1 bg-neutral-200 rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full transition-[width] duration-300" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
