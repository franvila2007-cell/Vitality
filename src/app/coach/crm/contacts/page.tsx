import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { CrmStage } from '@/lib/supabase/database.types';
import { SOURCES, SOURCE_META, STAGES, STAGE_META, sourceLabel } from '@/lib/crm/constants';
import { ago } from '@/lib/crm/format';

const input = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand';

// Searchable contact list. Filters are plain GET params so a filtered view
// is a link (the overview's funnel and source bars link straight in here).
export default async function CrmContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string; source?: string; tag?: string }> }) {
  const { q = '', stage = '', source = '', tag = '' } = await searchParams;
  const supabase = await createClient();
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  let query = supabase
    .from('crm_contacts')
    .select('id, full_name, email, phone, source, stage, tags, last_activity_at, client_id')
    .order('last_activity_at', { ascending: false })
    .limit(500);
  if (STAGES.some((s) => s.key === stage)) query = query.eq('stage', stage as CrmStage);
  if (source) query = query.eq('source', source);
  if (tag) query = query.contains('tags', [tag.toLowerCase()]);
  const term = q.trim().replace(/[%,()]/g, ' ').trim();
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data: rows, error } = await query;
  const filtered = !!(term || stage || source || tag);

  return (
    <div>
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
        <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-neutral-50">Filter</button>
      </form>
      <div className="flex items-center justify-between mb-2 text-2xs text-neutral-400">
        <span>
          {rows?.length ?? 0} contact{rows?.length === 1 ? '' : 's'}
          {tag && <> · tagged <b>#{tag}</b></>}
          {filtered && <> · <Link href="/coach/crm/contacts" className="underline">clear filters</Link></>}
        </span>
        <a href={`/coach/crm/export?${new URLSearchParams({ q, stage, source, tag }).toString()}`} className="underline hover:text-neutral-600">Export CSV</a>
      </div>

      {error && <p className="text-sm text-status-bad-text">Couldn&apos;t load contacts: {error.message}</p>}
      {!error && rows?.length === 0 && <p className="text-sm text-neutral-400 py-6 text-center">{filtered ? 'No contacts match.' : 'No contacts yet.'}</p>}

      <div className="flex flex-col gap-1.5">
        {rows?.map((c) => (
          <Link key={c.id} href={`/coach/crm/contacts/${c.id}`} className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3 hover:border-neutral-300">
            <span className="w-9 h-9 rounded-full bg-brand-light text-brand-dark flex items-center justify-center text-sm font-semibold flex-shrink-0">
              {c.full_name.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{c.full_name}</p>
              <p className="text-2xs text-neutral-400 truncate">{[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details'}</p>
            </div>
            <span className="hidden sm:block text-2xs text-neutral-400 w-28 truncate">{SOURCE_META[c.source]?.emoji} {sourceLabel(c.source)}</span>
            <span className={`text-3xs font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 flex-shrink-0 ${STAGE_META[c.stage].className}`}>{STAGE_META[c.stage].short}</span>
            <span className="hidden sm:block text-2xs text-neutral-400 w-16 text-right flex-shrink-0">{ago(c.last_activity_at, nowMs)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
