import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Answers, Section } from '@/lib/assessment/questions';
import type { MealPlanSource } from '@/lib/supabase/database.types';
import { MEAL_PLAN_STATUS_META } from '@/lib/mealPlan/status';
import { getInboxCounts } from '@/lib/coach/formInboxes';
import AssessmentAnswers from '@/components/coach/AssessmentAnswers';
import MealPlanStatusPicker from '@/components/coach/MealPlanStatusPicker';
import { InboxTabs } from '@/components/coach/FormInboxes';
import { ibfLocation } from '@/lib/mealPlan/questions';

// Automated plan state, shown next to the request's own status.
const AUTO_PLAN_BADGE: Record<string, { label: string; className: string }> = {
  building: { label: 'Plan building', className: 'border-border text-neutral-500' },
  ready: { label: 'Plan → Gamma', className: 'border-border text-neutral-500' },
  generating: { label: 'Plan → Gamma', className: 'border-border text-neutral-500' },
  generated: { label: 'Plan in Gamma', className: 'bg-status-good-bg text-status-good-text border-status-good/30' },
  needs_review: { label: 'Plan needs you', className: 'bg-status-warn-bg text-status-warn-text border-status-warn/30' },
  failed: { label: 'Plan failed', className: 'bg-status-bad-bg text-status-bad-text border-status-bad/30' },
};

const LOCATION_BADGE = { Sliema: 'bg-[#e6f4fb] text-[#2a8fbf] border-[#2a8fbf]/20', Mriehel: 'bg-ibf-red-light text-ibf-red border-ibf-red/20' } as const;

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Someone who sends the form twice is one person: same name (ignoring case and
// spacing), or the same phone number when the name was typed differently.
function personKey(r: { full_name: string; phone: string }, byPhone: Map<string, string>): string {
  const name = r.full_name.trim().toLowerCase().replace(/\s+/g, ' ');
  const phone = (r.phone ?? '').replace(/\D/g, '').slice(-8);
  if (phone.length === 8 && byPhone.has(phone)) return byPhone.get(phone)!;
  if (phone.length === 8) byPhone.set(phone, name);
  return name;
}

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
  const [{ data: rows, error }, counts, { data: clients }, { data: plans }] = await Promise.all([
    supabase
      .from('meal_plan_requests')
      .select('id, full_name, email, phone, answers, status, created_at')
      .eq('source', source)
      .order('created_at', { ascending: true })
      .limit(500),
    getInboxCounts(supabase),
    // Requests from someone who already has a client account (matched by
    // email, same as assessments) link straight to their client page.
    supabase.from('profiles').select('id, email').eq('role', 'client'),
    // Automated plans (src/lib/mealPlan) — the latest version per request.
    supabase.from('meal_plans').select('request_id, status, gamma_url, version').order('version', { ascending: false }),
  ]);
  const planByRequest = new Map<string, { status: string; gamma_url: string | null }>();
  for (const p of plans || []) if (!planByRequest.has(p.request_id)) planByRequest.set(p.request_id, p);
  const clientIdByEmail = new Map((clients || []).map((c) => [c.email.toLowerCase(), c.id]));

  // One entry per person, numbered in the order people first sent the form;
  // repeat forms are kept under the person (newest first) instead of listed twice.
  type Row = NonNullable<typeof rows>[number];
  const byPhone = new Map<string, string>();
  const people = new Map<string, { number: number; forms: Row[] }>();
  for (const r of rows || []) {
    const key = personKey(r, byPhone);
    const person = people.get(key) ?? { number: people.size + 1, forms: [] };
    person.forms.unshift(r);
    people.set(key, person);
  }
  const list = [...people.values()].sort((a, b) => b.forms[0].created_at.localeCompare(a.forms[0].created_at));
  const newCount = list.filter((p) => p.forms[0].status === 'new').length;
  const plansMade = list.filter((p) => p.forms.some((f) => planByRequest.get(f.id)?.gamma_url)).length;
  const at = (loc: 'Sliema' | 'Mriehel') => list.filter((p) => ibfLocation(p.forms[0].answers as Answers) === loc).length;
  const sliema = at('Sliema');
  const mriehel = at('Mriehel');

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 page-fade-in">
      <InboxTabs active={source} counts={counts} />
      <h1 className="text-h1 font-semibold">{title} ({list.length} {list.length === 1 ? 'person' : 'people'})</h1>
      <p className="text-2xs text-neutral-400 mb-4">
        {[
          `${plansMade} meal ${plansMade === 1 ? 'plan' : 'plans'} made`,
          sliema || mriehel ? `Sliema ${sliema} · Mriehel ${mriehel}` : null,
          newCount > 0 ? `${newCount} new — waiting for a plan` : 'All caught up',
        ].filter(Boolean).join(' · ')}
      </p>

      {error && <p className="text-sm text-status-bad-text">Couldn&apos;t load requests: {error.message}</p>}
      {!error && list.length === 0 && <p className="text-sm text-neutral-400">{emptyText}</p>}

      <div className="flex flex-col gap-2">
        {list.map(({ number, forms }) => {
          const r = forms[0];
          const a = r.answers as Answers;
          const meta = MEAL_PLAN_STATUS_META[r.status];
          const clientId = r.email ? clientIdByEmail.get(r.email.toLowerCase()) : undefined;
          // The newest plan made for this person, from any of their forms.
          const planForm = forms.find((f) => planByRequest.has(f.id));
          const plan = planForm ? planByRequest.get(planForm.id) : undefined;
          const planBadge = plan ? AUTO_PLAN_BADGE[plan.status] : null;
          const location = ibfLocation(a);
          return (
            <details key={r.id} className="group bg-surface border border-border rounded-xl overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-neutral-50">
                <span className="w-7 shrink-0 text-2xs tabular-nums text-neutral-400">#{number}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.full_name}</div>
                  <div className="text-2xs text-neutral-400 truncate">
                    {[a.goal, a.age && `${a.age} yrs`, a.weight && `${a.weight} kg`, a.meals_per_day && `${a.meals_per_day} meals/day`, forms.length > 1 && `${forms.length} forms sent`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {location && <span className={`text-3xs font-medium uppercase tracking-wide rounded-full border px-2 py-0.5 shrink-0 ${LOCATION_BADGE[location]}`}>{location}</span>}
                {clientId && <span className="text-3xs font-medium uppercase tracking-wide rounded-full bg-brand-light text-brand-dark px-2 py-0.5 shrink-0">Client</span>}
                {planBadge && <span className={`text-3xs font-medium uppercase tracking-wide rounded-full border px-2 py-0.5 shrink-0 ${planBadge.className}`}>{planBadge.label}</span>}
                <span className={`text-3xs font-medium uppercase tracking-wide rounded-full border px-2 py-0.5 shrink-0 ${meta.className}`}>{meta.label}</span>
                <div className="text-2xs text-neutral-400 shrink-0 hidden sm:block">{fmtDate(r.created_at)}</div>
                <span className="text-neutral-300 transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="border-t border-border px-4 py-4 flex flex-col gap-5">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {r.email && <a href={`mailto:${r.email}`} className="text-brand-dark hover:underline">{r.email}</a>}
                  {r.phone && <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} className="text-brand-dark hover:underline">{r.phone}</a>}
                  {clientId && <Link href={`/coach/clients/${clientId}`} className="font-medium text-brand-dark hover:underline">Open their client page →</Link>}
                  {plan?.gamma_url && <a href={plan.gamma_url} target="_blank" rel="noreferrer" className="font-medium text-brand-dark hover:underline">Open their meal plan in Gamma →</a>}
                  {planForm && <Link href={`/coach/meal-plans/test/${planForm.id}`} className="text-neutral-500 hover:underline">Plan details</Link>}
                  <span className="text-neutral-400 sm:hidden">{fmtDate(r.created_at)}</span>
                </div>
                {forms.length > 1 && (
                  <div className="text-2xs text-neutral-500">
                    <span className="font-medium">Earlier forms:</span>{' '}
                    {forms.slice(1).map((f, i) => {
                      const earlier = planByRequest.get(f.id);
                      return (
                        <span key={f.id}>
                          {i > 0 && ' · '}
                          {fmtDate(f.created_at)}
                          {earlier?.gamma_url && <> (<a href={earlier.gamma_url} target="_blank" rel="noreferrer" className="text-brand-dark hover:underline">plan</a>)</>}
                        </span>
                      );
                    })}
                    {' '}— showing the newest answers below.
                  </div>
                )}
                <MealPlanStatusPicker id={r.id} initial={r.status} email={r.email} name={r.full_name} syncCrm={source === 'ironbodyfit'} />
                <AssessmentAnswers answers={a} sections={sections} />
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
