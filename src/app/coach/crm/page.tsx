import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ACTIVITY_META, OPEN_STAGES, SOURCE_META, STAGE_META, sourceLabel } from '@/lib/crm/constants';
import { ago, euro } from '@/lib/crm/format';
import CrmTaskList from '@/components/crm/CrmTaskList';
import { CopyLink } from '@/components/crm/CrmActions';

const DAY = 864e5;

// Funnel links worth sharing, each tagged so leads land with their source.
const FUNNEL_LINKS = [
  { label: 'Join form · Instagram', path: '/join?src=instagram' },
  { label: 'Join form · TikTok', path: '/join?src=tiktok' },
  { label: 'Join form · Referral', path: '/join?src=referral' },
  { label: 'Join form · Website', path: '/join?src=website' },
  { label: 'Onboarding assessment', path: '/assessment' },
  { label: 'IronBodyFit meal plan', path: '/ironbodyfit-meal-plans' },
  { label: 'Vitality meal plan', path: '/vitality-meal-plan' },
];

export default async function CrmOverviewPage() {
  const supabase = await createClient();
  // Server component: "now" per request is what we want.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const d30 = new Date(nowMs - 30 * DAY).toISOString();
  const d90 = new Date(nowMs - 90 * DAY).toISOString();

  const [contactsRes, tasksRes, activityRes, wonRes] = await Promise.all([
    supabase.from('crm_contacts').select('id, full_name, source, stage, value_eur, created_at').limit(10000),
    supabase.from('crm_tasks').select('id, title, due_on, done_at, contact_id').is('done_at', null).order('due_on').limit(50),
    supabase.from('crm_activities').select('id, contact_id, kind, body, meta, created_at').order('created_at', { ascending: false }).limit(12),
    // Became a client in the last 30 days: a stage move to won, or an account created.
    supabase.from('crm_activities').select('contact_id, kind, body, meta').gte('created_at', d30).in('kind', ['stage', 'system']),
  ]);
  const contacts = contactsRes.data || [];
  const nameById = new Map(contacts.map((c) => [c.id, c.full_name]));

  const isLead = (c: { source: string }) => c.source !== 'existing_client';
  const open = contacts.filter((c) => OPEN_STAGES.includes(c.stage));
  const newLeads30 = contacts.filter((c) => isLead(c) && c.created_at >= d30).length;
  const newClients30 = new Set(
    (wonRes.data || [])
      .filter((a) => (a.kind === 'stage' && (a.meta as { to?: string })?.to === 'won') || (a.kind === 'system' && a.body.startsWith('Client account created')))
      .map((a) => a.contact_id)
  ).size;
  const cohort = contacts.filter((c) => isLead(c) && c.created_at >= d90);
  const conversion = cohort.length ? Math.round((cohort.filter((c) => c.stage === 'won').length / cohort.length) * 100) : null;
  const pipelineValue = open.reduce((a, c) => a + (Number(c.value_eur) || 0), 0);
  const monthlyRevenue = contacts.filter((c) => c.stage === 'won').reduce((a, c) => a + (Number(c.value_eur) || 0), 0);

  const funnel = [...OPEN_STAGES, 'won' as const].map((k) => ({ key: k, n: contacts.filter((c) => c.stage === k).length }));
  const funnelMax = Math.max(1, ...funnel.map((f) => f.n));

  const bySource = new Map<string, { total: number; won: number }>();
  for (const c of contacts) {
    if (!isLead(c) || c.created_at < d90) continue;
    const s = bySource.get(c.source) ?? { total: 0, won: 0 };
    s.total++;
    if (c.stage === 'won') s.won++;
    bySource.set(c.source, s);
  }
  const sources = [...bySource.entries()].sort((a, b) => b[1].total - a[1].total);
  const sourceMax = Math.max(1, ...sources.map(([, s]) => s.total));

  const tasks = (tasksRes.data || []).map((t) => ({ ...t, contactName: nameById.get(t.contact_id) }));
  const dueSoon = tasks.filter((t) => t.due_on <= new Date(nowMs + 7 * DAY).toISOString().slice(0, 10));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label="Open leads" value={String(open.length)} sub={`${newLeads30} new in 30 days`} />
        <Kpi label="New clients" value={String(newClients30)} sub="last 30 days" />
        <Kpi label="Conversion" value={conversion == null ? '–' : `${conversion}%`} sub="leads → clients, 90 days" />
        <Kpi label="Pipeline" value={euro(pipelineValue)} sub={monthlyRevenue ? `${euro(monthlyRevenue)}/mo from clients` : 'open deal value / mo'} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card title="Funnel" action={<Link href="/coach/crm/pipeline" className="text-xs font-medium text-brand-dark hover:opacity-70">Pipeline →</Link>}>
          <div className="flex flex-col gap-2">
            {funnel.map((f) => (
              <Link key={f.key} href={`/coach/crm/contacts?stage=${f.key}`} className="group flex items-center gap-2">
                <span className="w-24 flex-shrink-0 text-xs text-neutral-500 group-hover:text-neutral-800">{STAGE_META[f.key].label}</span>
                <span className="flex-1 h-6 rounded-md bg-neutral-100 overflow-hidden">
                  <span className={`block h-full rounded-md ${STAGE_META[f.key].dot} opacity-80`} style={{ width: `${Math.max(f.n ? 6 : 0, (f.n / funnelMax) * 100)}%` }} />
                </span>
                <span className="w-8 text-right text-sm font-semibold tabular-nums">{f.n}</span>
              </Link>
            ))}
          </div>
        </Card>

        <Card title="Leads by source" sub="last 90 days">
          {sources.length === 0 && <p className="text-sm text-neutral-400">No leads yet — share a funnel link below.</p>}
          <div className="flex flex-col gap-2">
            {sources.map(([key, s]) => (
              <Link key={key} href={`/coach/crm/contacts?source=${key}`} className="group flex items-center gap-2">
                <span className="w-28 flex-shrink-0 truncate text-xs text-neutral-500 group-hover:text-neutral-800">{SOURCE_META[key]?.emoji} {sourceLabel(key)}</span>
                <span className="flex-1 h-6 rounded-md bg-neutral-100 overflow-hidden">
                  <span className="block h-full rounded-md assess-gradient" style={{ width: `${Math.max(6, (s.total / sourceMax) * 100)}%` }} />
                </span>
                <span className="w-14 text-right text-2xs text-neutral-500 tabular-nums"><b className="text-sm text-neutral-900">{s.total}</b>{s.won ? ` · ${s.won}✓` : ''}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card title="Follow-ups" sub={tasks.length > dueSoon.length ? `next 7 days · ${tasks.length} open` : 'next 7 days'}>
          <CrmTaskList tasks={dueSoon} emptyText="Nothing due — add follow-ups from a contact’s page." />
        </Card>

        <Card title="Recent activity">
          {(activityRes.data || []).length === 0 && <p className="text-sm text-neutral-400">Nothing yet.</p>}
          <div className="flex flex-col gap-2.5">
            {(activityRes.data || []).map((a) => {
              const meta = a.meta as { from?: string; to?: string };
              const text = a.kind === 'stage'
                ? `${STAGE_META[meta.from as keyof typeof STAGE_META]?.label ?? meta.from} → ${STAGE_META[meta.to as keyof typeof STAGE_META]?.label ?? meta.to}`
                : a.body.split('\n')[0];
              return (
                <Link key={a.id} href={`/coach/crm/contacts/${a.contact_id}`} className="flex items-start gap-2.5 group">
                  <span className="text-sm leading-5">{ACTIVITY_META[a.kind].emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate"><span className="font-medium group-hover:underline">{nameById.get(a.contact_id) ?? 'Contact'}</span> <span className="text-neutral-500">· {text}</span></p>
                    <p className="text-2xs text-neutral-400">{ago(a.created_at, nowMs)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      <Card title="Your funnel links" sub="every submission lands here automatically, tagged with its source">
        <div className="flex flex-col divide-y divide-border">
          {FUNNEL_LINKS.map((l) => (
            <div key={l.path} className="flex items-center gap-3 py-2">
              <span className="flex-1 min-w-0">
                <span className="block text-sm">{l.label}</span>
                <span className="block font-mono text-2xs text-neutral-400 truncate">{l.path}</span>
              </span>
              <CopyLink path={l.path} />
            </div>
          ))}
        </div>
        <p className="text-2xs text-neutral-400 mt-2">Make your own tag with any source, e.g. <span className="font-mono">/join?src=facebook</span>.</p>
      </Card>

      <p className="text-center text-2xs text-neutral-400">
        {contacts.length} contacts · {contacts.filter((c) => c.stage === 'won').length} clients ·{' '}
        <a href="/coach/crm/export" className="underline hover:text-neutral-600">Export CSV</a>
      </p>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-3">
      <p className="text-3xs font-semibold uppercase tracking-wider text-neutral-400">{label}</p>
      <p className="text-xl font-semibold tabular-nums mt-1">{value}</p>
      <p className="text-2xs text-neutral-400 leading-snug">{sub}</p>
    </div>
  );
}

function Card({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-surface border border-border rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <p className="text-sm font-medium">{title}{sub && <span className="text-2xs font-normal text-neutral-400"> · {sub}</span>}</p>
        {action}
      </div>
      {children}
    </div>
  );
}
