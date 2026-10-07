import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Answers } from '@/lib/assessment/questions';
import AssessmentAnswers from '@/components/coach/AssessmentAnswers';
import AddClientFromAssessment from '@/components/coach/AddClientFromAssessment';
import { clientSetupFromAssessment } from '@/lib/assessment/clientSetup';
import { getInboxCounts } from '@/lib/coach/formInboxes';
import { InboxTabs } from '@/components/coach/FormInboxes';

// Read-only list of onboarding assessments submitted via the public
// /assessment form. Auth/role guard lives in coach/layout.tsx, and RLS
// (assessments_select_coach) only returns rows to the coach anyway.
export default async function AssessmentsPage() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from('assessments')
    .select('id, full_name, email, phone, answers, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  // Which submissions already belong to a client account (matched by email,
  // same as the client detail page) — those get a link instead of "Add".
  const { data: clients } = await supabase.from('profiles').select('id, email').eq('role', 'client');
  const clientIdByEmail = new Map((clients || []).map((c) => [c.email.toLowerCase(), c.id]));
  const counts = await getInboxCounts(supabase);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 page-fade-in">
      <InboxTabs active="assessments" counts={counts} />
      <h1 className="text-h1 font-semibold mb-4">Assessments ({rows?.length ?? 0})</h1>

      {error && <p className="text-sm text-status-bad-text">Couldn&apos;t load assessments: {error.message}</p>}
      {!error && rows?.length === 0 && (
        <p className="text-sm text-neutral-400">No assessments yet. Send new clients the link to <span className="font-mono">/assessment</span>.</p>
      )}

      <div className="flex flex-col gap-2">
        {rows?.map((r) => {
          const clientId = clientIdByEmail.get(r.email.toLowerCase());
          return (
            <details key={r.id} className="group bg-surface border border-border rounded-xl overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-neutral-50">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.full_name}</div>
                  <div className="text-2xs text-neutral-400 truncate">{r.email} · {r.phone}</div>
                </div>
                {clientId && <span className="text-3xs font-medium uppercase tracking-wide rounded-full bg-status-good-bg text-status-good-text px-2 py-0.5 shrink-0">Client</span>}
                <div className="text-2xs text-neutral-400 shrink-0">
                  {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <span className="text-neutral-300 transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="border-t border-border px-4 py-4 flex flex-col gap-5">
                {clientId ? (
                  <Link href={`/coach/clients/${clientId}`} className="text-sm font-medium text-brand-dark hover:underline">Open their client page →</Link>
                ) : (
                  <AddClientFromAssessment initial={clientSetupFromAssessment(r.answers as Answers)} />
                )}
                <AssessmentAnswers answers={r.answers as Answers} />
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
