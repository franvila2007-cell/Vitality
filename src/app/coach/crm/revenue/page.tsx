import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PACKAGE_META, IBF_MEAL_PLAN_PRICE } from '@/lib/crm/constants';
import type { CrmPackage } from '@/lib/supabase/database.types';
import { euro, shortDate } from '@/lib/crm/format';

// Revenue = packages sold (their full price, counted on the day the package
// starts), the same definition as the Overview's Money section — so the
// IronBodyFit €10 meal plans switched on in the CRM are included automatically.
// Cash collected = payments actually received in the period.

type Cat = 'coaching' | 'challenge' | 'vitality' | 'ibf';
const CATS: { key: Cat; label: string; bar: string; text: string }[] = [
  { key: 'coaching', label: '1-1 Coaching', bar: 'bg-brand', text: 'text-brand-dark' },
  { key: 'challenge', label: '8-Week Challenge', bar: 'bg-[#26A88A]', text: 'text-[#26A88A]' },
  { key: 'vitality', label: 'Vitality meal plans', bar: 'bg-[#2a8fbf]', text: 'text-[#2a8fbf]' },
  { key: 'ibf', label: 'IronBodyFit meal plans', bar: 'bg-ibf-red', text: 'text-ibf-red' },
];
const CAT_META = Object.fromEntries(CATS.map((c) => [c.key, c])) as Record<Cat, (typeof CATS)[number]>;

const RANGES = [
  { key: 'month', label: 'This month' },
  { key: 'last', label: 'Last month' },
  { key: '3m', label: '3 months' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const monthStartOf = (y: number, m: number) => ymd(new Date(Date.UTC(y, m, 1)));

export default async function CrmRevenuePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rawRange } = await searchParams;
  const range: RangeKey = RANGES.some((r) => r.key === rawRange) ? (rawRange as RangeKey) : 'month';

  const supabase = await createClient();
  // Server component: "now" per request is what we want.
  // eslint-disable-next-line react-hooks/purity
  const now = new Date(Date.now());
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const thisMonth = monthStartOf(y, m);
  const nextMonth = monthStartOf(y, m + 1);
  const [from, to]: [string, string] =
    range === 'month' ? [thisMonth, nextMonth]
    : range === 'last' ? [monthStartOf(y, m - 1), thisMonth]
    : range === '3m' ? [monthStartOf(y, m - 2), nextMonth]
    : range === 'year' ? [`${y}-01-01`, `${y + 1}-01-01`]
    : ['0000-01-01', '9999-12-31'];

  const [contactsRes, paymentsRes] = await Promise.all([
    supabase.from('crm_contacts').select('id, full_name, brand, stage, package, package_price, package_start').not('package', 'is', null).limit(10000),
    supabase.from('crm_payments').select('amount, due_on, paid_on').limit(20000),
  ]);
  const contacts = contactsRes.data || [];
  const payments = paymentsRes.data || [];

  const catOf = (c: { package: CrmPackage | null; brand: string }): Cat =>
    c.package === 'meal_plan' ? (c.brand === 'ironbodyfit' ? 'ibf' : 'vitality') : c.package === '8_week_challenge' ? 'challenge' : 'coaching';

  // Every sale with a price and a start date.
  const sales = contacts
    .filter((c) => c.package && c.package_start && Number(c.package_price) > 0)
    .map((c) => ({ id: c.id, name: c.full_name, pkg: c.package as CrmPackage, cat: catOf(c), price: Number(c.package_price), date: c.package_start as string }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const inRange = sales.filter((s) => s.date >= from && s.date < to);

  const sum = (list: { price: number }[]) => list.reduce((a, s) => a + s.price, 0);
  const byCat = (cat: Cat) => inRange.filter((s) => s.cat === cat);
  const total = sum(inRange);
  const cash = payments.filter((p) => p.paid_on && p.paid_on >= from && p.paid_on < to).reduce((a, p) => a + Number(p.amount), 0);
  const coaching = byCat('coaching'), challenge = byCat('challenge'), vitality = byCat('vitality'), ibf = byCat('ibf');
  const earlyBird = challenge.filter((s) => s.price === 197), fullPrice = challenge.filter((s) => s.price === 247), otherPrice = challenge.filter((s) => s.price !== 197 && s.price !== 247);
  const mealPlanTotal = sum(vitality) + sum(ibf);

  // IronBodyFit: how many of their meal-plan clients were charged the €10.
  const ibfClients = contacts.filter((c) => c.brand === 'ironbodyfit' && c.package === 'meal_plan' && c.stage === 'won');
  const ibfCharged = ibfClients.filter((c) => Number(c.package_price) > 0).length;

  // Last six months, stacked by category.
  const trend = Array.from({ length: 6 }, (_, i) => {
    const start = monthStartOf(y, m - (5 - i));
    const end = monthStartOf(y, m - (5 - i) + 1);
    const list = sales.filter((s) => s.date >= start && s.date < end);
    return {
      label: new Date(start + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      current: start === thisMonth,
      parts: CATS.map((c) => ({ cat: c.key, v: sum(list.filter((s) => s.cat === c.key)) })),
      total: sum(list),
    };
  });
  const trendMax = Math.max(1, ...trend.map((t) => t.total));
  const rangeLabel = RANGES.find((r) => r.key === range)!.label.toLowerCase();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/coach/crm/revenue${r.key === 'month' ? '' : `?range=${r.key}`}`}
            className={`flex-shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium ${range === r.key ? 'border-brand bg-brand text-white' : 'border-border text-neutral-500 hover:text-neutral-800'}`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {/* Total */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <p className="text-3xs font-semibold uppercase tracking-wider text-neutral-400">Total revenue · {rangeLabel}</p>
        <p className="text-3xl font-semibold tabular-nums mt-1">{euro(total)}</p>
        <p className="text-2xs text-neutral-400">
          {inRange.length} sale{inRange.length === 1 ? '' : 's'} · {euro(cash)} cash collected
        </p>
        {total > 0 && (
          <>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-neutral-100 mt-3">
              {CATS.map((c) => {
                const v = sum(byCat(c.key));
                return v > 0 ? <span key={c.key} className={c.bar} style={{ width: `${(v / total) * 100}%` }} /> : null;
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {CATS.map((c) => (
                <span key={c.key} className="flex items-center gap-1.5 text-2xs text-neutral-500">
                  <span className={`w-2 h-2 rounded-full ${c.bar}`} />{c.label} <b className="text-neutral-800 tabular-nums">{euro(sum(byCat(c.key)))}</b>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* The two businesses */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card title="1-1 Coaching" value={euro(sum(coaching))} sub={`${coaching.length} package${coaching.length === 1 ? '' : 's'} sold`} accent="text-brand-dark">
          {(['3_months', '6_months', '12_months'] as CrmPackage[]).map((p) => {
            const list = coaching.filter((s) => s.pkg === p);
            return list.length > 0 ? <Row key={p} label={PACKAGE_META[p].label} count={list.length} value={sum(list)} /> : null;
          })}
          {coaching.length === 0 && <p className="text-sm text-neutral-400">No coaching packages sold in this period.</p>}
          {coaching.length > 0 && <Row label="Average package" value={sum(coaching) / coaching.length} muted />}
        </Card>

        <Card title="8-Week Challenge" value={euro(sum(challenge))} sub={`${challenge.length} spot${challenge.length === 1 ? '' : 's'} sold`} accent="text-[#26A88A]">
          <Row label="Early bird · €197" count={earlyBird.length} value={sum(earlyBird)} dot="bg-[#26A88A]" />
          <Row label="Full price · €247" count={fullPrice.length} value={sum(fullPrice)} dot="bg-[#26A88A]/50" />
          {otherPrice.length > 0 && <Row label="Other price" count={otherPrice.length} value={sum(otherPrice)} />}
          {challenge.length === 0 && <p className="text-sm text-neutral-400">No challenge spots sold in this period.</p>}
        </Card>

        <Card title="Meal plans" value={euro(mealPlanTotal)} sub={`${vitality.length + ibf.length} plan${vitality.length + ibf.length === 1 ? '' : 's'} sold`} accent="text-[#2a8fbf]">
          <Row label="Vitality" count={vitality.length} value={sum(vitality)} dot="bg-[#2a8fbf]" />
          <Row label={`IronBodyFit · ${euro(IBF_MEAL_PLAN_PRICE)} each`} count={ibf.length} value={sum(ibf)} dot="bg-ibf-red" />
          {ibfClients.length > 0 && (
            <p className="text-2xs text-neutral-400 pt-1">
              <Link href="/coach/crm/contacts?type=ibf_meal_plan" className="underline hover:text-neutral-600">{ibfCharged} of {ibfClients.length} IronBodyFit plans</Link> charged overall — switch the €10 on a client to add it.
            </p>
          )}
        </Card>
      </div>

      {/* Trend */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <p className="text-sm font-medium mb-3">Last 6 months</p>
        <div className="flex items-end gap-2 sm:gap-3 h-36">
          {trend.map((t) => (
            <div key={t.label} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
              <span className="text-2xs tabular-nums text-neutral-500 mb-1">{t.total > 0 ? euro(t.total) : ''}</span>
              <div className="w-full flex flex-col-reverse rounded-t-md overflow-hidden" style={{ height: `${Math.max(t.total ? 4 : 0, (t.total / trendMax) * 100)}%`, maxHeight: 'calc(100% - 1.25rem)' }}>
                {t.parts.map((p) => p.v > 0 && <span key={p.cat} className={CAT_META[p.cat].bar} style={{ height: `${(p.v / t.total) * 100}%` }} />)}
              </div>
              <span className={`text-2xs mt-1.5 ${t.current ? 'font-semibold text-neutral-800' : 'text-neutral-400'}`}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Every sale, tucked away */}
      <details className="bg-surface border border-border rounded-xl group">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-medium">All sales <span className="text-2xs font-normal text-neutral-400">· {inRange.length} in this period</span></span>
          <span className="text-neutral-300 transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="border-t border-border px-4 py-2 flex flex-col divide-y divide-border">
          {inRange.length === 0 && <p className="text-sm text-neutral-400 py-3">No sales in this period.</p>}
          {inRange.slice(0, 100).map((s) => (
            <Link key={s.id} href={`/coach/crm/contacts/${s.id}`} className="flex items-center gap-2.5 py-2 hover:bg-neutral-50 -mx-2 px-2 rounded-lg">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CAT_META[s.cat].bar}`} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm truncate">{s.name}</span>
                <span className="block text-2xs text-neutral-400">{s.cat === 'coaching' ? PACKAGE_META[s.pkg].label : CAT_META[s.cat].label} · {shortDate(s.date)}</span>
              </span>
              <span className="text-sm font-medium tabular-nums">{euro(s.price)}</span>
            </Link>
          ))}
          {inRange.length > 100 && <p className="text-2xs text-neutral-400 py-2">Showing the latest 100.</p>}
        </div>
      </details>

      <p className="text-center text-2xs text-neutral-400">Revenue counts a package at its full price on the day it starts. Cash collected is what has actually been paid.</p>
    </div>
  );
}

function Card({ title, value, sub, accent, children }: { title: string; value: string; sub: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 min-w-0">
      <p className="text-sm font-medium">{title}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-1 ${accent}`}>{value}</p>
      <p className="text-2xs text-neutral-400 mb-3">{sub}</p>
      <div className="flex flex-col gap-1.5 border-t border-border pt-3">{children}</div>
    </div>
  );
}

function Row({ label, count, value, dot, muted }: { label: string; count?: number; value: number; dot?: string; muted?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${muted ? 'text-neutral-400' : ''}`}>
      {dot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />}
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {count != null && <span className="text-2xs text-neutral-400 tabular-nums">{count}×</span>}
      <span className="w-16 text-right font-medium tabular-nums">{euro(value)}</span>
    </div>
  );
}
