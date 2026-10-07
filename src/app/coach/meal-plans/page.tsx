import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Answers } from '@/lib/assessment/questions';
import { MEAL_PLAN_SECTIONS } from '@/lib/mealPlan/questions';
import AssessmentAnswers from '@/components/coach/AssessmentAnswers';
import MealPlanStatusPicker from '@/components/coach/MealPlanStatusPicker';
import { MEAL_PLAN_STATUS_META } from '@/lib/mealPlan/status';

// IronBodyFit meal-plan requests submitted via the public /ironbodyfit-meal-plans form —
// kept apart from onboarding assessments. Auth/role guard lives in
// coach/layout.tsx, and RLS (meal_plan_requests_select_coach) only returns
// rows to the coach anyway.
export default async function MealPlansPage() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from('meal_plan_requests')
    .select('id, full_name, email, phone, answers, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  const newCount = rows?.filter((r) => r.status === 'new').length ?? 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 page-fade-in">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-h1 font-semibold">Meal Plans ({rows?.length ?? 0})</h1>
        <Link href="/coach" className="text-sm text-neutral-500 hover:text-neutral-800">← Clients</Link>
      </div>
      <p className="text-2xs text-neutral-400 mb-4">
        IronBodyFit requests{newCount > 0 ? ` · ${newCount} new` : ''} · form link: <span className="font-mono">/ironbodyfit-meal-plans</span>
      </p>

      {error && <p className="text-sm text-status-bad-text">Couldn&apos;t load meal plan requests: {error.message}</p>}
      {!error && rows?.length === 0 && (
        <p className="text-sm text-neutral-400">No requests yet. Share the link to <span className="font-mono">/ironbodyfit-meal-plans</span> with IronBodyFit members.</p>
      )}

      <div className="flex flex-col gap-2">
        {rows?.map((r) => {
          const a = r.answers as Answers;
          const meta = MEAL_PLAN_STATUS_META[r.status];
          return (
            <details key={r.id} className="group bg-surface border border-border rounded-xl overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-neutral-50">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.full_name}</div>
                  <div className="text-2xs text-neutral-400 truncate">
                    {[a.goal, a.age && `${a.age} yrs`, a.weight && `${a.weight} kg`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className={`text-3xs font-medium uppercase tracking-wide rounded-full border px-2 py-0.5 shrink-0 ${meta.className}`}>{meta.label}</span>
                <div className="text-2xs text-neutral-400 shrink-0">
                  {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <span className="text-neutral-300 transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="border-t border-border px-4 py-4 flex flex-col gap-5">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <a href={`mailto:${r.email}`} className="text-brand-dark hover:underline">{r.email}</a>
                  <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} className="text-brand-dark hover:underline">{r.phone}</a>
                </div>
                <MealPlanStatusPicker id={r.id} initial={r.status} />
                <AssessmentAnswers answers={a} sections={MEAL_PLAN_SECTIONS} />
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
