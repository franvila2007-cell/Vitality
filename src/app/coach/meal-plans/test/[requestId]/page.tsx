import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import MealPlanBuildRunner from '@/components/coach/MealPlanBuildRunner';
import { recipeIngredientsLine } from '@/lib/mealPlan/gammaContent';
import type { PlanState } from '@/lib/mealPlan/pipeline';
import type { Issue } from '@/lib/mealPlan/validate';

export const maxDuration = 60;

// Coach-only test view of an automated meal plan (auth guard in
// coach/layout.tsx; RLS on meal_plans only returns rows to the coach).
// Shows exactly what would go into Gamma — targets, every recipe with its
// USDA-calculated nutrition, the checks — without spending Gamma credits.
export default async function MealPlanTestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const supabase = await createClient();
  const [{ data: request }, { data: plan }] = await Promise.all([
    supabase.from('meal_plan_requests').select('id, full_name').eq('id', requestId).maybeSingle(),
    supabase.from('meal_plans').select('*').eq('request_id', requestId).order('version', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!request) notFound();

  const state = (plan?.state ?? {}) as PlanState;
  const issues = (plan?.issues ?? []) as Issue[];
  const t = state.targets;
  const finished = plan && plan.status !== 'building';

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 page-fade-in flex flex-col gap-5">
      <div>
        <Link href="/coach/meal-plans" className="text-2xs text-neutral-400 hover:underline">← IronBody Fit meal plans</Link>
        <h1 className="text-h1 font-semibold">{request.full_name} — test plan</h1>
        <p className="text-2xs text-neutral-400">
          {plan ? `Version ${plan.version} · ${plan.status === 'building' ? `building (${plan.stage})` : plan.status.replace('_', ' ')}` : 'Not built yet'} · Nothing is sent to Gamma from this page.
        </p>
      </div>

      <MealPlanBuildRunner requestId={requestId} autoStart={plan?.status === 'building'} hasPlan={!!finished} />

      {plan?.status === 'failed' && <p className="text-sm text-status-bad-text">The build failed: {plan.last_error}</p>}

      {finished && t && (
        <>
          <section className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-2">
            <h2 className="font-semibold">Targets</h2>
            <p className="text-sm">Goal: {t.goalLabel}</p>
            <p className="text-sm">Maintenance <b>{t.maintenanceKcal} kcal</b> · Target <b>{t.targetKcal} kcal</b> · Protein {t.protein} g · Carbs {t.carbs} g · Fat {t.fat} g</p>
            <p className="text-sm">{t.meals.map((m) => `${m.label} ~${m.kcal} kcal`).join(' · ')}</p>
            <p className="text-2xs text-neutral-400">Activity: {t.activityLabel}</p>
            {state.intake && (
              <p className="text-2xs text-neutral-400">
                Left out: {[...state.intake.rules.excludedTags, ...state.intake.rules.excludedTerms].join(', ') || 'nothing'}
                {state.intake.rules.avoidDishStyles.length ? ` · avoiding ${state.intake.rules.avoidDishStyles.join(', ')}` : ''}
                {state.intake.rules.exclusionNote ? ` · Note in plan: “${state.intake.rules.exclusionNote}”` : ''}
              </p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-1">
            <h2 className="font-semibold">Checks</h2>
            {issues.length === 0 && <p className="text-sm text-status-good-text">✓ Everything passed</p>}
            {issues.map((i, n) => (
              <p key={n} className={`text-sm ${i.level === 'blocker' ? 'text-status-bad-text' : 'text-status-warn-text'}`}>{i.level === 'blocker' ? '✗' : '⚠'} {i.message}</p>
            ))}
          </section>

          {t.meals.map((m) => (
            <section key={m.slot} className="flex flex-col gap-2">
              <h2 className="font-semibold">{m.label} <span className="text-2xs font-normal text-neutral-400">target ~{m.kcal} kcal · {m.protein} g protein</span></h2>
              {(state.recipes ?? []).filter((r) => r.slot === m.slot).map((r) => {
                const d = r.fit.nutrition.display;
                return (
                  <div key={r.name} className="rounded-xl border border-border bg-surface p-4">
                    {state.photos?.[r.name] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={state.photos[r.name]!.url} alt={r.name} className="mb-2 h-40 w-full rounded-lg object-cover" />
                    ) : state.photos ? <p className="mb-2 text-2xs text-status-warn-text">No matching stock photo found</p> : null}
                    <div className="font-medium">{r.name} {!r.fit.ok && <span className="text-status-warn-text">⚠</span>}</div>
                    <p className="text-sm text-neutral-600">{recipeIngredientsLine(r)}. {r.method}</p>
                    <p className="text-sm font-semibold mt-1">{d.kcal} kcal · P: {d.protein}g · C: {d.carbs}g · F: {d.fat}g</p>
                    <details className="mt-1">
                      <summary className="text-2xs text-neutral-400 cursor-pointer">USDA sources</summary>
                      <ul className="text-2xs text-neutral-500 mt-1">
                        {r.fit.nutrition.items.map((it) => (
                          <li key={it.ingredientId}>{it.grams} g {it.name} — {Math.round(it.kcal)} kcal · FDC {it.fdcId} ({it.usdaDescription})</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                );
              })}
            </section>
          ))}

          {plan?.gamma_prompt && (
            <details className="rounded-xl border border-border bg-surface p-4">
              <summary className="font-semibold cursor-pointer">What would be sent to Gamma</summary>
              <pre className="mt-2 whitespace-pre-wrap text-2xs text-neutral-600">{plan.gamma_prompt}</pre>
            </details>
          )}
        </>
      )}
    </div>
  );
}
