import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  ACTIVITY_META, BRAND_META, CLIENT_TYPES, OPEN_STAGES, PACKAGE_META, SOURCE_META, STAGE_META,
  brandOrder, clientType, packageEnd, sourceLabel,
} from '@/lib/crm/constants';
import { addDays } from '@/lib/date';
import { ago, euro, shortDate } from '@/lib/crm/format';
import CrmTaskList from '@/components/crm/CrmTaskList';
import CrmPayments from '@/components/crm/CrmPayments';
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

// The CRM at a glance, in four sections: Money (revenue sold vs cash actually
// collected), Clients (by type), To do (payments, follow-ups, renewals,
// missing packages) and Leads (funnel + sources).
export default async function CrmOverviewPage() {
  const supabase = await createClient();
  // Server component: "now" per request is what we want.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const monthEnd = today.slice(0, 8) + '31';
  const monthName = new Date(nowMs).toLocaleDateString('en-GB', { month: 'long' });
  const d30 = new Date(nowMs - 30 * DAY).toISOString();
  const d90 = new Date(nowMs - 90 * DAY).toISOString();

  const [contactsRes, tasksRes, activityRes, clientsRes, paymentsRes] = await Promise.all([
    supabase.from('crm_contacts').select('id, full_name, source, stage, brand, created_at, client_id, package, package_price, package_start, payment_plan').limit(10000),
    supabase.from('crm_tasks').select('id, title, due_on, done_at, contact_id').is('done_at', null).order('due_on').limit(50),
    // Bulk-import entries (e.g. the IronBodyFit client sheet) would drown out real activity.
    supabase.from('crm_activities').select('id, contact_id, kind, body, meta, created_at').is('meta->>import', null).order('created_at', { ascending: false }).limit(10),
    supabase.from('profiles').select('id, created_at').eq('role', 'client'),
    supabase.from('crm_payments').select('id, contact_id, amount, due_on, paid_on, method, note').order('due_on').limit(20000),
  ]);
  const contacts = (contactsRes.data || []).sort((a, b) => brandOrder(a.brand) - brandOrder(b.brand));
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const nameById = new Map(contacts.map((c) => [c.id, c.full_name]));
  const clientSince = new Map((clientsRes.data || []).map((p) => [p.id, p.created_at.slice(0, 10)]));
  const payments = paymentsRes.data || [];

  // ── Money ──
  const soldThisMonth = contacts.filter((c) => c.package && c.package_start && c.package_start >= monthStart && c.package_start <= today);
  const revenue = soldThisMonth.reduce((a, c) => a + (Number(c.package_price) || 0), 0);
  const collectedThisMonth = payments.filter((p) => p.paid_on && p.paid_on >= monthStart && p.paid_on <= today);
  const cash = collectedThisMonth.reduce((a, p) => a + Number(p.amount), 0);
  const unpaid = payments.filter((p) => !p.paid_on);
  const outstanding = unpaid.reduce((a, p) => a + Number(p.amount), 0);
  const overdue = unpaid.filter((p) => p.due_on < today);
  const overdueSum = overdue.reduce((a, p) => a + Number(p.amount), 0);
  const monthlyPayers = contacts.filter((c) => c.stage === 'won' && c.payment_plan === 'monthly');
  const dueThisMonth = unpaid.filter((p) => p.due_on >= monthStart && p.due_on <= monthEnd).reduce((a, p) => a + Number(p.amount), 0);

  // ── Clients ──
  const current = contacts.filter((c) => c.stage === 'won');
  const typeCount = (key: string) => current.filter((c) => clientType(c) === key).length;
  const joinedOn = (c: (typeof contacts)[number]) => c.package_start ?? (c.client_id ? clientSince.get(c.client_id) : undefined) ?? null;
  const newThisMonth = current.filter((c) => (joinedOn(c) ?? '') >= monthStart);

  // ── To do ──
  const paymentsDue = unpaid
    .filter((p) => p.due_on <= addDays(today, 7))
    .map((p) => ({ ...p, amount: Number(p.amount), contactName: nameById.get(p.contact_id) }));
  const tasks = (tasksRes.data || []).map((t) => ({ ...t, contactName: nameById.get(t.contact_id) }));
  const dueSoon = tasks.filter((t) => t.due_on <= addDays(today, 7));
  const in45 = addDays(today, 45);
  const renewals = current
    .flatMap((c) => {
      const end = c.package && c.package_start ? packageEnd(c.package_start, c.package) : null;
      return end && end >= today && end <= in45 ? [{ c, end }] : [];
    })
    .sort((a, b) => a.end.localeCompare(b.end));
  const noPackage = current.filter((c) => !c.package);

  // ── Leads ──
  const isLead = (c: { source: string }) => c.source !== 'existing_client';
  const open = contacts.filter((c) => OPEN_STAGES.includes(c.stage));
  const openIbf = open.filter((c) => c.brand === 'ironbodyfit').length;
  const newLeads30 = contacts.filter((c) => isLead(c) && c.created_at >= d30).length;
  const cohort = contacts.filter((c) => isLead(c) && c.created_at >= d90);
  const conversion = cohort.length ? Math.round((cohort.filter((c) => c.stage === 'won').length / cohort.length) * 100) : null;
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

  return (
    <div className="flex flex-col gap-6">
      <Section title={`Money · ${monthName}`} action={<Link href="/coach/crm/revenue" className="text-xs font-medium text-brand-dark hover:opacity-70">Revenue breakdown →</Link>}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi label="Revenue" value={euro(revenue)} sub={`${soldThisMonth.length} package${soldThisMonth.length === 1 ? '' : 's'} sold`} tone="brand" />
          <Kpi label="Cash collected" value={euro(cash)} sub={`${collectedThisMonth.length} payment${collectedThisMonth.length === 1 ? '' : 's'} received`} tone="good" />
          <Kpi label="Outstanding" value={euro(outstanding)} sub={overdue.length ? `${euro(overdueSum)} overdue` : 'nothing overdue'} tone={overdue.length ? 'bad' : undefined} />
          <Kpi label="Monthly payers" value={String(monthlyPayers.length)} sub={dueThisMonth ? `${euro(dueThisMonth)} still due this month` : 'all paid this month'} />
        </div>
        <p className="text-2xs text-neutral-400 mt-1.5">Revenue = packages sold this month (full price). Cash collected = money actually received this month.</p>
      </Section>

      <Section title="Clients" action={<Link href="/coach/crm/contacts?type=clients" className="text-xs font-medium text-brand-dark hover:opacity-70">All clients →</Link>}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {CLIENT_TYPES.map((t) => (
            <Link key={t.key} href={`/coach/crm/contacts?type=${t.key}`} className="bg-surface border border-border rounded-xl p-3 hover:border-neutral-300">
              <span className={`inline-block rounded-full px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide ${t.chip}`}>{t.label}</span>
              <p className="text-xl font-semibold tabular-nums mt-1.5">{typeCount(t.key)}</p>
              <p className="text-2xs text-neutral-400">current</p>
            </Link>
          ))}
          <Kpi label={`New · ${monthName}`} value={String(newThisMonth.length)} sub={newThisMonth.length ? newThisMonth.slice(0, 3).map((c) => c.full_name.split(' ')[0]).join(', ') + (newThisMonth.length > 3 ? '…' : '') : 'none yet'} />
        </div>
      </Section>

      <Section title="To do">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card title="Payments due" sub={overdue.length ? `${overdue.length} overdue` : 'next 7 days'}>
            <CrmPayments payments={paymentsDue} emptyText="No payments due this week." />
          </Card>
          <Card title="Follow-ups" sub={tasks.length > dueSoon.length ? `next 7 days · ${tasks.length} open` : 'next 7 days'}>
            <CrmTaskList tasks={dueSoon} emptyText="Nothing due — add follow-ups from a contact’s page." />
          </Card>
          {noPackage.length > 0 && (
            <Card title="Clients without a package" sub={`${noPackage.length} — add what they bought`}>
              <div className="flex flex-col gap-1.5">
                {noPackage.slice(0, 8).map((c) => (
                  <Link key={c.id} href={`/coach/crm/contacts/${c.id}`} className={`flex items-center justify-between gap-2 rounded-lg border-l-4 ${BRAND_META[c.brand].stripe} bg-neutral-50 px-3 py-2 hover:bg-neutral-100`}>
                    <span className="text-sm truncate">{c.full_name}</span>
                    <span className="text-2xs font-medium text-brand-dark flex-shrink-0">Set package →</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {renewals.length > 0 && (
            <Card title="Renewals coming up" sub="packages ending in the next 45 days">
              <div className="flex flex-col gap-1.5">
                {renewals.map(({ c, end }) => (
                  <Link key={c.id} href={`/coach/crm/contacts/${c.id}`} className={`flex items-center justify-between gap-2 rounded-lg border-l-4 ${BRAND_META[c.brand].stripe} bg-neutral-50 px-3 py-2 hover:bg-neutral-100`}>
                    <span className="min-w-0">
                      <span className="block text-sm truncate">{c.full_name}</span>
                      <span className="block text-2xs text-neutral-400">{PACKAGE_META[c.package!].label} · {euro(Number(c.package_price) || 0)}</span>
                    </span>
                    <span className="text-2xs font-medium text-status-warn-text flex-shrink-0">ends {shortDate(end)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </Section>

      <Section title="Leads" action={<Link href="/coach/crm/pipeline" className="text-xs font-medium text-brand-dark hover:opacity-70">Pipeline →</Link>}>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Kpi label="Open leads" value={String(open.length)} sub={openIbf ? `${open.length - openIbf} V · ${openIbf} IBF` : 'all Vitality'} />
          <Kpi label="New leads" value={String(newLeads30)} sub="last 30 days" />
          <Kpi label="Conversion" value={conversion == null ? '–' : `${conversion}%`} sub="90 days" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card title="Funnel">
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
      </Section>

      <Section title="Activity & links">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card title="Recent activity">
            {(activityRes.data || []).length === 0 && <p className="text-sm text-neutral-400">Nothing yet.</p>}
            <div className="flex flex-col gap-2.5">
              {(activityRes.data || []).map((a) => {
                const meta = a.meta as { from?: string; to?: string };
                const text = a.kind === 'stage'
                  ? `${STAGE_META[meta.from as keyof typeof STAGE_META]?.label ?? meta.from} → ${STAGE_META[meta.to as keyof typeof STAGE_META]?.label ?? meta.to}`
                  : a.body.split('\n')[0];
                const contact = byId.get(a.contact_id);
                return (
                  <Link key={a.id} href={`/coach/crm/contacts/${a.contact_id}`} className="flex items-start gap-2.5 group">
                    <span className="text-sm leading-5">{ACTIVITY_META[a.kind].emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">
                        <span className={`font-medium group-hover:underline ${contact?.brand === 'ironbodyfit' ? 'text-ibf-red' : ''}`}>{contact?.full_name ?? 'Contact'}</span>{' '}
                        <span className="text-neutral-500">· {text}</span>
                      </p>
                      <p className="text-2xs text-neutral-400">{ago(a.created_at, nowMs)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
          <Card title="Your funnel links" sub="submissions land here, tagged with their source">
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
        </div>
      </Section>

      <p className="text-center text-2xs text-neutral-400">
        {contacts.length} contacts · {current.length} current clients ·{' '}
        <a href="/coach/crm/export" className="underline hover:text-neutral-600">Export CSV</a>
      </p>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-3xs font-semibold uppercase tracking-wider text-neutral-400">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'brand' | 'good' | 'bad' }) {
  const color = tone === 'brand' ? 'text-brand-dark' : tone === 'good' ? 'text-status-good-text' : tone === 'bad' ? 'text-status-bad-text' : '';
  return (
    <div className="bg-surface border border-border rounded-xl p-3">
      <p className="text-3xs font-semibold uppercase tracking-wider text-neutral-400">{label}</p>
      <p className={`text-xl font-semibold tabular-nums mt-1 ${color}`}>{value}</p>
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
