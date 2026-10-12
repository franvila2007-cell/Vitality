import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { CrmBrand, CrmStage } from '@/lib/supabase/database.types';
import {
  BRANDS, BRAND_META, CLIENT_TYPE_META, OPEN_STAGES, PACKAGE_META, SOURCES, SOURCE_META, STAGES, STAGE_META,
  clientType, sourceLabel,
} from '@/lib/crm/constants';
import { weightProgress } from '@/lib/crm/progress';
import { ago } from '@/lib/crm/format';
import { CrmPlanStatus, CrmRowDelete } from '@/components/crm/CrmActions';
import CrmIbfPaid from '@/components/crm/CrmIbfPaid';

const input = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand';

// Quick views across the top: who's a lead, who's a client and what kind.
const TYPES = [
  { key: '', label: 'All' },
  { key: 'leads', label: 'Leads' },
  { key: 'clients', label: 'Clients' },
  { key: 'coaching', label: '1-1 Coaching' },
  { key: 'meal_plans', label: 'Meal plans' },
  { key: 'past', label: 'Past / lost' },
];

// Searchable contact list, grouped Vitality first then IronBodyFit, each
// colour-coded, showing what kind of client someone is, their package, and —
// for 1-1 clients — their weight since the first weigh-in. Filters are plain
// GET params so a filtered view is a link.
export default async function CrmContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string; source?: string; tag?: string; brand?: string; type?: string }> }) {
  const { q = '', stage = '', source = '', tag = '', brand = '', type = '' } = await searchParams;
  const supabase = await createClient();
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  let query = supabase
    .from('crm_contacts')
    .select('id, full_name, email, phone, source, stage, tags, last_activity_at, client_id, brand, package, package_price, package_start, payment_plan, list_position')
    .order('last_activity_at', { ascending: false })
    .limit(1000);
  if (STAGES.some((s) => s.key === stage)) query = query.eq('stage', stage as CrmStage);
  if (source) query = query.eq('source', source);
  if (BRANDS.some((b) => b.key === brand)) query = query.eq('brand', brand as CrmBrand);
  if (tag) query = query.contains('tags', [tag.toLowerCase()]);
  const term = q.trim().replace(/[%,()]/g, ' ').trim();
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data, error } = await query;

  const rows = (data || []).filter((c) => {
    const t = clientType(c);
    switch (type) {
      case 'leads': return OPEN_STAGES.includes(c.stage);
      case 'clients': return c.stage === 'won';
      case 'coaching': return c.stage === 'won' && t === 'coaching';
      case 'meal_plans': return c.stage === 'won' && (t === 'vitality_meal_plan' || t === 'ibf_meal_plan');
      case 'vitality_meal_plan': case 'ibf_meal_plan': return c.stage === 'won' && t === type;
      case 'past': return c.stage === 'past' || c.stage === 'lost';
      default: return true;
    }
  });
  const weights = await weightProgress(supabase, rows.filter((r) => r.client_id).map((r) => r.client_id!));

  const params = { q, stage, source, tag, brand, type };
  const href = (over: Partial<typeof params>) =>
    `/coach/crm/contacts?${new URLSearchParams(Object.entries({ ...params, ...over }).filter(([, v]) => v)).toString()}`;
  const filtered = !!(term || stage || source || tag || brand || type);
  // Vitality: most recent activity first. IronBodyFit: the order of the
  // coach's client sheet, new meal-plan form sign-ups at the bottom.
  const groups = BRANDS.map((b) => ({
    brand: b,
    rows: rows.filter((r) => r.brand === b.key).sort((x, y) => (b.key === 'ironbodyfit' ? x.list_position - y.list_position : 0)),
  })).filter((g) => g.rows.length > 0);
  const activeType = TYPES.some((t) => t.key === type) ? type : type ? 'clients' : '';

  return (
    <div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1 mb-2">
        {[{ key: '', label: 'All' }, ...BRANDS].map((b) => {
          const on = brand === b.key;
          const tone = b.key === 'ironbodyfit' ? 'bg-ibf-red text-white' : b.key === 'vitality' ? 'bg-brand text-white' : 'bg-surface text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]';
          return (
            <Link key={b.key || 'all'} href={href({ brand: b.key })} className={`rounded-lg py-1.5 text-center text-xs font-semibold ${on ? tone : 'text-neutral-500 hover:text-neutral-800'}`}>{b.label}</Link>
          );
        })}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 -mx-1 px-1">
        {TYPES.map((t) => (
          <Link
            key={t.key || 'all'}
            href={href({ type: t.key })}
            className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${activeType === t.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-border text-neutral-600 hover:border-neutral-300'}`}
          >{t.label}</Link>
        ))}
        {/* IronBodyFit meal plans: has their plan gone out yet? */}
        {[{ tag: 'plan-pending', label: '⏳ Plan to send' }, { tag: 'plan-sent', label: '✓ Plan sent' }].map((t) => (
          <Link
            key={t.tag}
            href={href({ tag: tag === t.tag ? '' : t.tag })}
            className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${tag === t.tag ? 'border-ibf-red bg-ibf-red text-white' : 'border-ibf-red/30 text-ibf-red hover:border-ibf-red'}`}
          >{t.label}</Link>
        ))}
      </div>

      <form className="flex flex-wrap gap-2 mb-3" action="/coach/crm/contacts">
        <input name="q" defaultValue={q} placeholder="Search name, email or phone…" className={`${input} flex-1 min-w-48`} />
        <select name="stage" defaultValue={stage} className={input}>
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select name="source" defaultValue={source} className={input}>
          <option value="">All sources</option>
          {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {tag && <input type="hidden" name="tag" value={tag} />}
        {brand && <input type="hidden" name="brand" value={brand} />}
        {type && <input type="hidden" name="type" value={type} />}
        <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-neutral-50">Filter</button>
      </form>
      <div className="flex items-center justify-between mb-2 text-2xs text-neutral-400">
        <span>
          {rows.length} contact{rows.length === 1 ? '' : 's'}
          {tag && <> · tagged <b>#{tag}</b></>}
          {filtered && <> · <Link href="/coach/crm/contacts" className="underline">clear filters</Link></>}
        </span>
        <a href={`/coach/crm/export?${new URLSearchParams({ q, stage, source, tag, brand }).toString()}`} className="underline hover:text-neutral-600">Export CSV</a>
      </div>

      {error && <p className="text-sm text-status-bad-text">Couldn&apos;t load contacts: {error.message}</p>}
      {!error && rows.length === 0 && <p className="text-sm text-neutral-400 py-6 text-center">{filtered ? 'No contacts match.' : 'No contacts yet.'}</p>}

      <div className="flex flex-col gap-5">
        {groups.map(({ brand: b, rows: list }) => (
          <section key={b.key}>
            <p className="flex items-center gap-2 mb-2 text-xs font-semibold">
              <Image src={b.logo} alt="" width={16} height={14} />
              {b.label}
              <span className="font-normal text-neutral-400">{list.length}</span>
            </p>
            <div className="flex flex-col gap-1.5">
              {list.map((c) => {
                const t = clientType(c);
                const w = c.client_id ? weights.get(c.client_id) : undefined;
                const good = w && w.change !== 0 && (w.goalType === 'lose') === (w.change < 0);
                return (
                  <div key={c.id} className={`flex items-center bg-surface border border-border border-l-4 ${BRAND_META[c.brand].stripe} rounded-xl hover:border-neutral-300`}>
                    <Link href={`/coach/crm/contacts/${c.id}`} className="flex flex-1 min-w-0 items-center gap-3 pl-4 pr-2 py-3">
                      <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${BRAND_META[c.brand].chip}`}>
                        {c.full_name.trim().charAt(0).toUpperCase() || '?'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.full_name}</p>
                        <p className="text-2xs text-neutral-400 truncate">
                          {t && c.stage === 'won'
                            ? <>
                                <span className={`font-semibold ${t === 'ibf_meal_plan' ? 'text-ibf-red' : 'text-brand-dark'}`}>{CLIENT_TYPE_META[t].label}</span>
                                {c.package && t === 'coaching' && <> · {PACKAGE_META[c.package].label}</>}
                                {c.payment_plan === 'monthly' && <> · monthly</>}
                                {w && <> · <span className={good ? 'text-status-good-text' : ''}>{w.first}→{w.latest}kg</span></>}
                              </>
                            : <>{SOURCE_META[c.source]?.emoji} {sourceLabel(c.source)}{c.email || c.phone ? ` · ${c.email || c.phone}` : ''}</>}
                        </p>
                      </div>
                      {/* Meal-plan rows carry the Sent / To send badge instead on phones, so the name has room. */}
                      <span className={`text-3xs font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 flex-shrink-0 ${STAGE_META[c.stage].className} ${c.tags.includes('plan-sent') || c.tags.includes('plan-pending') ? 'hidden sm:inline' : ''}`}>{STAGE_META[c.stage].short}</span>
                      <span className="hidden sm:block text-2xs text-neutral-400 w-16 text-right flex-shrink-0">{ago(c.last_activity_at, nowMs)}</span>
                    </Link>
                    {c.brand === 'ironbodyfit' && c.package === 'meal_plan' && (
                      <span className="flex-shrink-0 mr-1.5"><CrmIbfPaid id={c.id} price={c.package_price != null ? Number(c.package_price) : null} start={c.package_start} /></span>
                    )}
                    <CrmPlanStatus id={c.id} tags={c.tags} email={c.email} name={c.full_name} size="sm" />
                    <CrmRowDelete id={c.id} name={c.full_name} />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
