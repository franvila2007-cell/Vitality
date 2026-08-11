'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RANK_META, type Rank, type RankBreakdown } from '@/lib/ranking';

const RANKS: Rank[] = ['gold', 'silver', 'bronze'];

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}

export default function RankOverride({
  userId, date, breakdown, initialOverride,
}: { userId: string; date: string; breakdown: RankBreakdown; initialOverride: Rank | null }) {
  const supabase = createClient();
  const [override, setOverride] = useState<Rank | null>(initialOverride);
  const [saving, setSaving] = useState(false);
  const activeRank = override ?? breakdown.rank;

  async function setRank(rank: Rank) {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('rank_overrides').upsert({ user_id: userId, date, rank, set_by: user.id });
      setOverride(rank);
    }
    setSaving(false);
  }

  async function resetToAuto() {
    setSaving(true);
    await supabase.from('rank_overrides').delete().eq('user_id', userId).eq('date', date);
    setOverride(null);
    setSaving(false);
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">Rank · {date}</p>
        {override && <p className="text-[11px] text-neutral-400">set by coach</p>}
      </div>

      <div className="flex gap-2 mb-3">
        {RANKS.map((r) => (
          <button
            key={r}
            onClick={() => setRank(r)}
            disabled={saving}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
              activeRank === r ? RANK_META[r].className : 'border-border text-neutral-400 hover:text-neutral-700'
            }`}
          >
            {RANK_META[r].emoji} {RANK_META[r].label}
          </button>
        ))}
      </div>

      {override && (
        <button onClick={resetToAuto} disabled={saving} className="text-xs text-neutral-400 hover:text-neutral-600 mb-3 transition-colors">
          Reset to automatic ({RANK_META[breakdown.rank].label})
        </button>
      )}

      <div className="grid grid-cols-3 gap-2 text-center border-t border-border pt-3">
        <div>
          <div className="text-[10px] uppercase text-neutral-400">Habits</div>
          <div className="text-sm font-medium">{pct(breakdown.habitsPct)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-neutral-400">Macros</div>
          <div className="text-sm font-medium">{pct(breakdown.macroPct)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-neutral-400">Food quality</div>
          <div className="text-sm font-medium">{pct(breakdown.qualityPct)}</div>
        </div>
      </div>
    </div>
  );
}
