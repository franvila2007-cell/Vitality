import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getInboxCounts } from '@/lib/coach/formInboxes';
import { InboxTabs } from '@/components/coach/FormInboxes';
import { CHALLENGE_COHORT } from '@/lib/challenge/questions';
import HealthBadge from '@/components/challenge/HealthBadge';

// Temporary (8-Week Challenge, Oct 2026): everyone who filled in the intake
// at /challenge/intake after paying. Coach-only via coach/layout.tsx and RLS.
export default async function ChallengePage() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from('challenge_intakes')
    .select('id, full_name, email, phone, age, weight_kg, main_goal, health_flag, created_at')
    .eq('cohort', CHALLENGE_COHORT)
    .order('created_at', { ascending: false });
  const counts = await getInboxCounts(supabase);
  const flagged = rows?.filter((r) => r.health_flag).length ?? 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 page-fade-in">
      <InboxTabs active="challenge" counts={counts} />
      <h1 className="text-h1 font-semibold">8-Week Challenge ({rows?.length ?? 0})</h1>
      <p className="text-sm text-neutral-500 mt-1 mb-4">
        October 2026 · Week 1 starts Mon 26 Oct{flagged > 0 && <> · <span className="font-medium text-ibf-red">{flagged} health flag{flagged === 1 ? '' : 's'}</span></>}
      </p>

      {error && <p className="text-sm text-status-bad-text">Couldn&apos;t load intakes: {error.message}</p>}
      {!error && rows?.length === 0 && (
        <p className="text-sm text-neutral-400">No intakes yet. People land on <span className="font-mono">/challenge/intake</span> right after paying.</p>
      )}

      <div className="flex flex-col gap-2">
        {rows?.map((r) => (
          <Link key={r.id} href={`/coach/challenge/${r.id}`} className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3 hover:bg-neutral-50">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{r.full_name}</span>
                {r.health_flag && <HealthBadge />}
              </div>
              <div className="text-2xs text-neutral-400 truncate">{r.age} · {r.weight_kg} kg · {r.main_goal} · {r.phone}</div>
            </div>
            <div className="text-2xs text-neutral-400 shrink-0">
              {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </div>
            <span className="text-neutral-300">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
