import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Answers } from '@/lib/assessment/questions';
import AssessmentAnswers from '@/components/coach/AssessmentAnswers';

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

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 page-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-h1 font-semibold">Assessments ({rows?.length ?? 0})</h1>
        <Link href="/coach" className="text-sm text-neutral-500 hover:text-neutral-800">← Clients</Link>
      </div>

      {error && <p className="text-sm text-status-bad-text">Couldn&apos;t load assessments: {error.message}</p>}
      {!error && rows?.length === 0 && (
        <p className="text-sm text-neutral-400">No assessments yet. Send new clients the link to <span className="font-mono">/assessment</span>.</p>
      )}

      <div className="flex flex-col gap-2">
        {rows?.map((r) => {
          return (
            <details key={r.id} className="group bg-surface border border-border rounded-xl overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-neutral-50">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.full_name}</div>
                  <div className="text-2xs text-neutral-400 truncate">{r.email} · {r.phone}</div>
                </div>
                <div className="text-2xs text-neutral-400 shrink-0">
                  {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <span className="text-neutral-300 transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="border-t border-border px-4 py-4">
                <AssessmentAnswers answers={r.answers as Answers} />
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
