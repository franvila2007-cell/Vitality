import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { CrmBrand, CrmStage } from '@/lib/supabase/database.types';
import { BRANDS, BRAND_META, PACKAGE_META, SOURCES, SOURCE_META, STAGES, STAGE_META, sourceLabel } from '@/lib/crm/constants';
import { ago } from '@/lib/crm/format';

const input = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand';

// Searchable contact list, grouped Vitality first then IronBodyFit, each
// colour-coded. Filters are plain GET params so a filtered view is a link
// (the overview's funnel and source bars link straight in here).
export default async function CrmContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string; source?: string; tag?: string; brand?: string }> }) {
  const { q = '', stage = '', source = '', tag = '', brand = '' } = await searchParams;
  const supabase = await createClient();
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  let query = supabase
    .from('crm_contacts')
    .select('id, full_name, email, phone, source, stage, tags, last_activity_at, client_id, brand, package')
    .order('last_activity_at', { ascending: false })
    .limit(500);
  if (STAGES.some((s) => s.key === stage)) query = query.eq('stage', stage as CrmStage);
  if (source) query = query.eq('source', source);
  if (BRANDS.some((b) => b.key === brand)) query = query.eq('brand', brand as CrmBrand);
  if (tag) query = query.contains('tags', [tag.toLowerCase()]);
  const term = q.trim().replace(/[%,()]/g, ' ').trim();
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data: rows, error } = await query;
  const filtered = !!(term || stage || source || tag || brand);
  const groups = BRANDS.map((b) => ({ brand: b, rows: (rows || []).filter((r) => r.brand === b.key) })).filter((g) => g.rows.length > 0);
  const brandHref = (b: string) => `/coach/crm/contacts?${new URLSearchParams(Object.entries({ q, stage, source, tag, brand: b }).filter(([, v]) => v)).toString()}`;

  return (
    <div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1 mb-3">
        {[{ key: '', label: 'All' }, ...BRANDS].map((b) => {
          const on = brand === b.key;
          const tone = b.key === 'ironbodyfit' ? 'bg-ibf-red text-white' : b.key === 'vitality' ? 'bg-brand text-white' : 'bg-surface text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]';
          return (
            <Link key={b.key || 'all'} href={brandHref(b.key)} className={`rounded-lg py-1.5 text-center text-xs font-semibold ${on ? tone : 'text-neutral-500 hover:text-neutral-800'}`}>{b.label}</Link>
          );
        })}
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
        <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-neutral-50">Filter</button>
      </form>
      <div className="flex items-center justify-between mb-2 text-2xs text-neutral-400">
        <span>
          {rows?.length ?? 0} contact{rows?.length === 1 ? '' : 's'}
          {tag && <> · tagged <b>#{tag}</b></>}
          {filtered && <> · <Link href="/coach/crm/contacts" className="underline">clear filters</Link></>}
        </span>
        <a href={`/coach/crm/export?${new URLSearchParams({ q, stage, source, tag, brand }).toString()}`} className="underline hover:text-neutral-600">Export CSV</a>
      </div>

      {error && <p className="text-sm text-status-bad-text">Couldn&apos;t load contacts: {error.message}</p>}
      {!error && rows?.length === 0 && <p className="text-sm text-neutral-400 py-6 text-center">{filtered ? 'No contacts match.' : 'No contacts yet.'}</p>}

      <div className="flex flex-col gap-5">
        {groups.map(({ brand: b, rows: list }) => (
          <section key={b.key}>
            <p className="flex items-center gap-2 mb-2 text-xs font-semibold">
              <Image src={b.logo} alt="" width={16} height={14} />
              {b.label}
              <span className="font-normal text-neutral-400">{list.length}</span>
            </p>
            <div className="flex flex-col gap-1.5">
              {list.map((c) => (
                <Link key={c.id} href={`/coach/crm/contacts/${c.id}`} className={`flex items-center gap-3 bg-surface border border-border border-l-4 ${BRAND_META[c.brand].stripe} rounded-xl px-4 py-3 hover:border-neutral-300`}>
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${BRAND_META[c.brand].chip}`}>
                    {c.full_name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.full_name}</p>
                    <p className="text-2xs text-neutral-400 truncate">{[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details'}</p>
                  </div>
                  <span className="hidden sm:block text-2xs text-neutral-400 w-28 truncate">{SOURCE_META[c.source]?.emoji} {sourceLabel(c.source)}</span>
                  {c.package && <span className="hidden sm:inline text-3xs font-semibold rounded-full bg-neutral-100 text-neutral-600 px-2 py-0.5 flex-shrink-0">{PACKAGE_META[c.package].short}</span>}
                  <span className={`text-3xs font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 flex-shrink-0 ${STAGE_META[c.stage].className}`}>{STAGE_META[c.stage].short}</span>
                  <span className="hidden sm:block text-2xs text-neutral-400 w-16 text-right flex-shrink-0">{ago(c.last_activity_at, nowMs)}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
