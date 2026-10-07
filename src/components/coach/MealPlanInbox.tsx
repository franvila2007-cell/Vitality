import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Answers, Section } from '@/lib/assessment/questions';
import type { MealPlanSource } from '@/lib/supabase/database.types';
import { MEAL_PLAN_STATUS_META } from '@/lib/mealPlan/status';
import { getInboxCounts } from '@/lib/coach/formInboxes';
import AssessmentAnswers from '@/components/coach/AssessmentAnswers';
import MealPlanStatusPicker from '@/components/coach/MealPlanStatusPicker';
import { InboxTabs } from '@/components/coach/FormInboxes';

// One meal-plan inbox: /coach/meal-plans (IronBodyFit) and /coach/v-plans
// (Vitality clients) are the same list over meal_plan_requests, filtered by
// source. Auth/role guard lives in coach/layout.tsx, and RLS
// (meal_plan_requests_select_coach) only returns rows to the coach anyway.
export default async function MealPlanInbox({ source, sections, title, emptyText }: {
  source: MealPlanSource;
  sections: Section[];
  title: string;
  emptyText: string;
}) {
  const supabase = await createClient();
  const [{ data: rows, error }, counts, { data: clients }] = await Promise.all([
    supabase
      .from('meal_plan_requests')
      .select('id, full_name, email, phone, answers, status, created_at')
      .eq('source', source)
      .order('created_at', { ascending: false })
      .limit(200),
    getInboxCounts(supabase),
    // Requests from someone who already has a client account (matched by
    // email, same as assessments) link straight to their client page.
    supabase.from('profiles').select('id, email').eq('role', 'client'),
  ]);
  const clientIdByEmail = new Map((clients || []).map((c) => [c.email.toLowerCase(), c.id]));
  const newCount = rows?.filter((r) => r.status === 'new').length ?? 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 page-fade-in">
      <InboxTabs active={source} counts={counts} />
      <h1 className="text-h1 font-semibold">{title} ({rows?.length ?? 0})</h1>
      <p className="text-2xs text-neutral-400 mb-4">{newCount > 0 ? `${newCount} new — waiting for a plan` : 'All caught up'}</p>

      {error && <p className="text-sm text-status-bad-text">Couldn&apos;t load requests: {error.message}</p>}
      {!error && rows?.length === 0 && <p className="text-sm text-neutral-400">{emptyText}</p>}

      <div className="flex flex-col gap-2">
        {rows?.map((r) => {
          const a = r.answers as Answers;
          const meta = MEAL_PLAN_STATUS_META[r.status];
          const clientId = clientIdByEmail.get(r.email.toLowerCase());
          return (
            <details key={r.id} className="group bg-surface border border-border rounded-xl overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-neutral-50">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.full_name}</div>
                  <div className="text-2xs text-neutral-400 truncate">
                    {[a.goal, a.age && `${a.age} yrs`, a.weight && `${a.weight} kg`, a.meals_per_day && `${a.meals_per_day} meals/day`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {clientId && <span className="text-3xs font-medium uppercase tracking-wide rounded-full bg-brand-light text-brand-dark px-2 py-0.5 shrink-0">Client</span>}
                <span className={`text-3xs font-medium uppercase tracking-wide rounded-full border px-2 py-0.5 shrink-0 ${meta.className}`}>{meta.label}</span>
                <div className="text-2xs text-neutral-400 shrink-0 hidden sm:block">
                  {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <span className="text-neutral-300 transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="border-t border-border px-4 py-4 flex flex-col gap-5">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <a href={`mailto:${r.email}`} className="text-brand-dark hover:underline">{r.email}</a>
                  <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} className="text-brand-dark hover:underline">{r.phone}</a>
                  {clientId && <Link href={`/coach/clients/${clientId}`} className="font-medium text-brand-dark hover:underline">Open their client page →</Link>}
                  <span className="text-neutral-400 sm:hidden">
                    {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <MealPlanStatusPicker id={r.id} initial={r.status} />
                <AssessmentAnswers answers={a} sections={sections} />
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
