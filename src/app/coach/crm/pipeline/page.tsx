import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { CrmStage } from '@/lib/supabase/database.types';
import Image from 'next/image';
import { BRAND_META, PACKAGE_META, SOURCE_META, STAGE_META, brandOrder, sourceLabel } from '@/lib/crm/constants';
import { daysSince, dueLabel } from '@/lib/crm/format';
import CrmStagePicker from '@/components/crm/CrmStagePicker';
import { CrmPlanStatus } from '@/components/crm/CrmActions';

const DAY = 864e5;
const COLUMNS: CrmStage[] = ['lead', 'contacted', 'consult', 'proposal', 'won', 'lost'];

// Board view: one column per stage (scrolls sideways on a phone). Won and
// lost only show the last 30 days so the board stays about what's moving.
// Within a column, Vitality cards come first, then IronBodyFit (red stripe).
export default async function CrmPipelinePage() {
  const supabase = await createClient();
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const d30 = new Date(nowMs - 30 * DAY).toISOString();

  const [contactsRes, tasksRes] = await Promise.all([
    supabase.from('crm_contacts')
      .select('id, full_name, source, stage, brand, package, stage_changed_at, last_activity_at, tags')
      .in('stage', COLUMNS)
      .order('last_activity_at', { ascending: false })
      .limit(2000),
    supabase.from('crm_tasks').select('contact_id, due_on').is('done_at', null).order('due_on'),
  ]);
  const nextTask = new Map<string, string>();
  for (const t of tasksRes.data || []) if (!nextTask.has(t.contact_id)) nextTask.set(t.contact_id, t.due_on);

  const contacts = (contactsRes.data || []).filter((c) => !['won', 'lost'].includes(c.stage) || c.stage_changed_at >= d30);

  return (
    <div className="-mx-4 px-4 overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max">
        {COLUMNS.map((stage) => {
          const cards = contacts.filter((c) => c.stage === stage).sort((a, b) => brandOrder(a.brand) - brandOrder(b.brand));
          const ibf = cards.filter((c) => c.brand === 'ironbodyfit').length;
          return (
            <div key={stage} className="w-64 flex-shrink-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className={`w-2 h-2 rounded-full ${STAGE_META[stage].dot}`} />
                  {STAGE_META[stage].label}
                  <span className="text-neutral-400 font-normal">{cards.length}</span>
                </p>
                {ibf > 0 && <span className="text-2xs text-neutral-400">{cards.length - ibf} V · <span className="text-ibf-red">{ibf} IBF</span></span>}
              </div>
              {['won', 'lost'].includes(stage) && <p className="text-3xs text-neutral-400 px-1 -mt-1 mb-2">last 30 days</p>}
              <div className="flex flex-col gap-2 rounded-xl bg-neutral-100/70 p-2 min-h-24">
                {cards.length === 0 && <p className="text-2xs text-neutral-400 text-center py-4">Empty</p>}
                {cards.map((c) => {
                  const due = nextTask.get(c.id);
                  const label = due ? dueLabel(due, today) : null;
                  const stale = !['won', 'lost'].includes(stage) && daysSince(c.last_activity_at, nowMs) >= 7;
                  return (
                    <div key={c.id} className={`relative rounded-lg border border-border border-l-4 ${BRAND_META[c.brand].stripe} bg-surface p-3 hover:border-neutral-300`}>
                      <Link href={`/coach/crm/contacts/${c.id}`} className="absolute inset-0" aria-label={c.full_name} />
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{c.full_name}</span>
                        {c.brand === 'ironbodyfit' && <Image src="/ironbodyfit-logo.png" alt="IronBodyFit" width={13} height={12} className="flex-shrink-0" />}
                      </p>
                      <p className="text-2xs text-neutral-400 truncate">{SOURCE_META[c.source]?.emoji} {sourceLabel(c.source)} · {daysSince(c.stage_changed_at, nowMs)}d in stage</p>
                      {(c.package || label || stale || c.tags.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {c.package ? <Chip>📦 {PACKAGE_META[c.package].label}</Chip> : null}
                          {label && <Chip tone={label.tone === 'overdue' ? 'bad' : label.tone === 'today' ? 'warn' : undefined}>⏰ {label.text}</Chip>}
                          {stale && !label && <Chip tone="warn">Quiet {daysSince(c.last_activity_at, nowMs)}d</Chip>}
                          {c.tags.slice(0, 2).map((t) => <Chip key={t}>#{t}</Chip>)}
                        </div>
                      )}
                      <div className="relative mt-2 flex items-center justify-end gap-1.5">
                        <CrmPlanStatus id={c.id} tags={c.tags} size="sm" />
                        <CrmStagePicker id={c.id} initial={c.stage} compact />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: 'bad' | 'warn' }) {
  const cls = tone === 'bad' ? 'bg-status-bad-bg text-status-bad-text' : tone === 'warn' ? 'bg-status-warn-bg text-status-warn-text' : 'bg-neutral-100 text-neutral-600';
  return <span className={`rounded-full px-1.5 py-0.5 text-3xs font-medium ${cls}`}>{children}</span>;
}
