'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { MealPlanStatus } from '@/lib/supabase/database.types';
import { MEAL_PLAN_STATUS_META, MEAL_PLAN_STATUSES } from '@/lib/mealPlan/status';

// Moves a meal-plan request along as the plan gets written and delivered.
// RLS (meal_plan_requests_update_coach) only lets the coach do this.
export default function MealPlanStatusPicker({ id, initial }: { id: string; initial: MealPlanStatus }) {
  const supabase = createClient();
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: MealPlanStatus) {
    if (next === status) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from('meal_plan_requests').update({ status: next }).eq('id', id);
    if (error) setError("Couldn't update the status.");
    else {
      setStatus(next);
      // Refresh the server-rendered row badge and the "new" count.
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <div>
      <div className="flex gap-2">
        {MEAL_PLAN_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => choose(s)}
            disabled={saving}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
              status === s ? MEAL_PLAN_STATUS_META[s].className : 'border-border text-neutral-400 hover:text-neutral-700'
            }`}
          >
            {MEAL_PLAN_STATUS_META[s].label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-2xs text-status-bad-text">{error}</p>}
    </div>
  );
}
