'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { BADGES, type BadgeKey } from '@/lib/vitalityBadges';

// The streak badges shelf: earned ones in colour with Vitto, the rest locked.
// Shown in the client's Progress tab, and to the coach on the client's page
// (pass userId; RLS lets the coach read any client's badges).
export default function BadgeShelf({ userId, title = 'Your badges' }: { userId?: string; title?: string }) {
  const [supabase] = useState(() => createClient());
  const [earned, setEarned] = useState<Map<BadgeKey, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = userId ?? (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return;
      const { data } = await supabase.from('vitality_badges').select('badge, earned_at').eq('user_id', uid);
      if (!cancelled) setEarned(new Map((data || []).map((b) => [b.badge as BadgeKey, b.earned_at])));
    })();
    return () => { cancelled = true; };
  }, [supabase, userId]);

  if (!earned) return <div className="rounded-2xl bg-neutral-100 h-[168px] animate-pulse" />;

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-2xs text-neutral-400">{earned.size} of {BADGES.length} · Vital days in a row</p>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {BADGES.map((b) => {
          const when = earned.get(b.key);
          return (
            <div key={b.key} className="flex flex-col items-center text-center" title={when ? `Earned ${new Date(when).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : `Locked — ${b.days} Vital days in a row`}>
              <div className={`relative aspect-square w-full max-w-[72px] rounded-full border-[3px] ${when ? b.frame : 'border-dashed border-tier-flat bg-tier-flat-bg'}`}>
                {when
                  ? <Image src={b.vitto} alt={`Vitto — ${b.name}`} fill sizes="72px" className="object-contain p-1.5" />
                  : <span className="absolute inset-0 flex items-center justify-center text-lg opacity-60">🔒</span>}
                <span className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 text-3xs font-bold leading-4 ${when ? b.number : 'bg-tier-flat text-white'}`}>{b.days}</span>
              </div>
              <span className={`mt-2 text-3xs leading-tight font-medium ${when ? 'text-brand-dark' : 'text-neutral-400'}`}>{b.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
