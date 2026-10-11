import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Answers } from '@/lib/assessment/questions';
import { clientSetupFromAssessment, type ClientSetup } from '@/lib/assessment/clientSetup';
import { ACTIVITY_META, BRAND_META, CLIENT_TYPE_META, FORM_INBOX, SOURCE_META, STAGE_META, clientType, sourceLabel, waLink } from '@/lib/crm/constants';
import { weightProgress } from '@/lib/crm/progress';
import CrmPayments from '@/components/crm/CrmPayments';
import { packageContext } from '@/lib/crm/packages';
import CrmPackageEditor from '@/components/crm/CrmPackageEditor';
import Image from 'next/image';
import { ago, daysSince, euro, shortDate } from '@/lib/crm/format';
import CrmStagePicker from '@/components/crm/CrmStagePicker';
import CrmTaskList from '@/components/crm/CrmTaskList';
import CrmActivityComposer from '@/components/crm/CrmActivityComposer';
import { CrmDeleteContact, CrmEditDetails, CrmPlanStatus } from '@/components/crm/CrmActions';
import AddClientFromAssessment from '@/components/coach/AddClientFromAssessment';

// One contact: who they are, where they are in the pipeline, what's next,
// and everything that's happened with them (forms, notes, calls, moves).
export default async function CrmContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  const [contactRes, activitiesRes, tasksRes, paymentsRes] = await Promise.all([
    supabase.from('crm_contacts').select('*').eq('id', id).maybeSingle(),
    supabase.from('crm_activities').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(200),
    supabase.from('crm_tasks').select('*').eq('contact_id', id).order('done_at', { ascending: false, nullsFirst: true }).order('due_on').limit(50),
    supabase.from('crm_payments').select('*').eq('contact_id', id).order('due_on').limit(100),
  ]);
  const c = contactRes.data;
  if (!c) notFound();

  // Their latest assessment / meal-plan answers, to pre-fill "Add as client".
  let setup: ClientSetup | null = null;
  if (!c.client_id && c.email) {
    const [{ data: assessment }, { data: mealPlan }] = await Promise.all([
      supabase.from('assessments').select('answers').eq('email', c.email).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('meal_plan_requests').select('answers').eq('email', c.email).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (assessment) setup = clientSetupFromAssessment(assessment.answers as Answers);
    else {
      const a = (mealPlan?.answers ?? {}) as Answers;
      const w = Number(a.weight) || 0;
      setup = {
        fullName: c.full_name, email: c.email, startWeight: w, goalWeight: w,
        goalType: a.goal === 'Build muscle' ? 'gain' : 'lose',
        calories: 2000, proteinG: 150, carbsG: 200, fatG: 65,
      };
    }
  }

  const [pkgCtx, weights] = await Promise.all([
    packageContext(supabase, c.client_id),
    weightProgress(supabase, c.client_id ? [c.client_id] : []),
  ]);
  const weight = c.client_id ? weights.get(c.client_id) : undefined;
  const type = clientType(c);
  const payments = paymentsRes.data || [];
  const isClient = c.stage === 'won' || c.stage === 'past' || !!c.package;
  const tasks = tasksRes.data || [];
  const openTasks = tasks.filter((t) => !t.done_at);
  const doneTasks = tasks.filter((t) => t.done_at);
  const activities = activitiesRes.data || [];
  const formCount = activities.filter((a) => a.kind === 'form').length;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/coach/crm/contacts" className="text-sm text-neutral-500 hover:text-neutral-800 -mt-1">← Contacts</Link>

      <div className={`bg-surface border border-border border-l-4 ${BRAND_META[c.brand].stripe} rounded-xl p-4`}>
        <div className="flex items-start gap-3">
          <span className="w-12 h-12 rounded-full bg-brand-light text-brand-dark flex items-center justify-center text-lg font-semibold flex-shrink-0">
            {c.full_name.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-lg font-semibold leading-tight">{c.full_name}</p>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide ${BRAND_META[c.brand].chip}`}>
                <Image src={BRAND_META[c.brand].logo} alt="" width={12} height={11} />{BRAND_META[c.brand].label}
              </span>
              {type && <span className={`rounded-full px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide ${CLIENT_TYPE_META[type].chip}`}>{CLIENT_TYPE_META[type].label}</span>}
              <CrmPlanStatus id={c.id} tags={c.tags} email={c.email} size="sm" />
            </div>
            <p className="text-2xs text-neutral-400 mt-0.5">
              {SOURCE_META[c.source]?.emoji} {sourceLabel(c.source)} · added {shortDate(c.created_at)} · {STAGE_META[c.stage].label} for {daysSince(c.stage_changed_at, nowMs)}d
              {c.package_price != null ? <> · <b className="text-neutral-600">{euro(Number(c.package_price))}</b></> : null}
            </p>
            {c.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {c.tags.map((t) => <Link key={t} href={`/coach/crm/contacts?tag=${encodeURIComponent(t)}`} className="rounded-full bg-neutral-100 px-2 py-0.5 text-3xs font-medium text-neutral-600 hover:bg-neutral-200">#{t}</Link>)}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {c.phone && <Action href={waLink(c.phone)} external>💬 WhatsApp</Action>}
          {c.phone && <Action href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>📞 Call</Action>}
          {c.email && <Action href={`mailto:${c.email}`}>✉️ Email</Action>}
          {c.client_id && <Action href={`/coach/clients/${c.client_id}`}>⭐ Client page</Action>}
        </div>
        <p className="text-2xs text-neutral-400 mt-2">{[c.email, c.phone].filter(Boolean).join(' · ') || 'No email or phone yet — add them in Edit details.'}</p>

        <div className="border-t border-border mt-4 pt-4">
          <p className="text-3xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">Stage</p>
          <CrmStagePicker id={c.id} initial={c.stage} />
          {c.stage === 'lost' && c.lost_reason && <p className="text-xs text-neutral-500 mt-2">Lost because: {c.lost_reason}</p>}
        </div>

        {c.notes && (
          <div className="border-t border-border mt-4 pt-4">
            <p className="text-3xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">Notes</p>
            <p className="text-sm whitespace-pre-wrap">{c.notes}</p>
          </div>
        )}

        <div className="border-t border-border mt-4 pt-3 flex flex-wrap items-start justify-between gap-2">
          <CrmEditDetails contact={c} />
          <CrmDeleteContact id={c.id} name={c.full_name} />
        </div>
      </div>

      <div className={`bg-surface border rounded-xl p-4 ${isClient && !c.package ? 'border-brand/40 shadow-[0_4px_16px_-10px_rgba(15,168,166,0.5)]' : 'border-border'}`}>
        <p className="text-sm font-medium mb-1">{c.package ? 'Package' : isClient ? 'Which package did they join?' : 'Joined? Record their package'}</p>
        {!c.package && <p className="text-2xs text-neutral-400 mb-3">{isClient ? '1-1 coaching (3 months, 6 months or 1 year) or a €69.99 meal plan — add it, with how they pay, so revenue and cash collected are tracked.' : 'Saving a package marks them as a Client.'}</p>}
        <CrmPackageEditor
          contactId={c.id}
          brand={c.brand}
          initial={{ package: c.package, price: c.package_price != null ? Number(c.package_price) : null, start: c.package_start, plan: c.payment_plan, method: c.payment_method }}
          defaultStart={pkgCtx.defaultStart}
          suggestedPrices={pkgCtx.suggestedPrices}
        />
      </div>

      {(c.package || payments.length > 0) && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-sm font-medium mb-3">Payments</p>
          <CrmPayments payments={payments} contactId={c.id} emptyText="No payments recorded yet." />
        </div>
      )}

      {weight && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">Weight progress</p>
            <Link href={`/coach/clients/${c.client_id}`} className="text-xs font-medium text-brand-dark hover:opacity-70">Client page →</Link>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <WeightStat label="First weigh-in" value={`${weight.first}kg`} sub={shortDate(weight.firstDate)} />
            <WeightStat label="Latest" value={`${weight.latest}kg`} />
            <WeightStat
              label="Change"
              value={`${weight.change > 0 ? '+' : ''}${weight.change}kg`}
              tone={weight.change === 0 ? undefined : (weight.goalType === 'lose') === (weight.change < 0) ? 'good' : 'bad'}
            />
            <WeightStat label="Goal" value={weight.goal ? `${weight.goal}kg` : '–'} />
          </div>
          {weight.pctToGoal != null && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden"><div className="h-full rounded-full bg-brand" style={{ width: `${weight.pctToGoal}%` }} /></div>
              <p className="text-2xs text-neutral-400 mt-1">{weight.pctToGoal}% of the way to their goal</p>
            </div>
          )}
        </div>
      )}

      {!c.client_id && setup && c.stage !== 'past' && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-sm font-medium mb-1">Ready to start coaching?</p>
          <p className="text-2xs text-neutral-400 mb-3">Creates their app account and sends the invite — they&apos;ll move to Client here automatically.</p>
          <AddClientFromAssessment initial={setup} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-sm font-medium mb-3">Follow-ups</p>
          <CrmTaskList tasks={openTasks} contactId={c.id} emptyText="No follow-ups planned." />
          {doneTasks.length > 0 && (
            <details className="mt-3">
              <summary className="text-2xs text-neutral-400 cursor-pointer">{doneTasks.length} done</summary>
              <div className="mt-2"><CrmTaskList tasks={doneTasks} emptyText="" /></div>
            </details>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-sm font-medium mb-3">Log an interaction</p>
          <CrmActivityComposer contactId={c.id} />
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4">
        <p className="text-sm font-medium mb-3">Timeline <span className="text-2xs font-normal text-neutral-400">· {activities.length} events{formCount ? ` · ${formCount} form${formCount === 1 ? '' : 's'}` : ''}</span></p>
        {activities.length === 0 && <p className="text-sm text-neutral-400">Nothing yet.</p>}
        <ol className="relative flex flex-col gap-4 border-l border-border ml-3">
          {activities.map((a) => {
            const meta = (a.meta ?? {}) as { from?: string; to?: string; form?: string; answers?: Answers };
            const inbox = a.kind === 'form' && meta.form ? FORM_INBOX[meta.form] : null;
            return (
              <li key={a.id} className="ml-5 relative">
                <span className="absolute -left-[31px] top-0 w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center text-xs">{ACTIVITY_META[a.kind].emoji}</span>
                <p className="text-2xs text-neutral-400">
                  {ACTIVITY_META[a.kind].label} · {ago(a.created_at, nowMs)} · {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                {a.kind === 'stage' ? (
                  <p className="text-sm mt-0.5">
                    Moved from <b>{STAGE_META[meta.from as keyof typeof STAGE_META]?.label ?? meta.from}</b> to <b>{STAGE_META[meta.to as keyof typeof STAGE_META]?.label ?? meta.to}</b>
                  </p>
                ) : (
                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{a.body}</p>
                )}
                {inbox && meta.form !== 'join' && <Link href={inbox.href} className="text-2xs font-medium text-brand-dark hover:underline">Open in {inbox.label} →</Link>}
                {meta.form === 'join' && meta.answers && (
                  <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-2xs">
                    {(['interest', 'goal', 'heard'] as const).filter((k) => meta.answers![k]).map((k) => (
                      <div key={k} className="contents">
                        <dt className="text-neutral-400">{k === 'heard' ? 'Heard via' : k[0].toUpperCase() + k.slice(1)}</dt>
                        <dd className="text-neutral-700">{String(meta.answers![k])}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function WeightStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg bg-neutral-50 py-2 px-1">
      <div className="text-3xs uppercase tracking-wide text-neutral-400 leading-tight">{label}</div>
      <div className={`text-sm font-semibold ${tone === 'good' ? 'text-status-good-text' : tone === 'bad' ? 'text-status-bad-text' : ''}`}>{value}</div>
      {sub && <div className="text-3xs text-neutral-400">{sub}</div>}
    </div>
  );
}

function Action({ href, external, children }: { href: string; external?: boolean; children: React.ReactNode }) {
  const cls = 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-brand hover:text-brand-dark';
  if (href.startsWith('/')) return <Link href={href} className={cls}>{children}</Link>;
  return <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>;
}
