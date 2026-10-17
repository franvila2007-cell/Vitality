import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Answers } from '@/lib/assessment/questions';
import AssessmentAnswers from '@/components/coach/AssessmentAnswers';
import { CHALLENGE_SECTIONS, HEALTH_FLAG_IDS } from '@/lib/challenge/questions';
import { waLink } from '@/lib/crm/constants';
import HealthBadge from '@/components/challenge/HealthBadge';

// Temporary (8-Week Challenge): one person's intake, health answers first.
export default async function ChallengeIntakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: r } = await supabase.from('challenge_intakes').select('*').eq('id', id).maybeSingle();
  if (!r) notFound();
  const answers = r.answers as Answers;
  const health = CHALLENGE_SECTIONS.find((s) => s.id === 'health')!;
  const yes = health.questions.filter((q) => HEALTH_FLAG_IDS.includes(q.id) && answers[q.id] === 'Yes');

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 page-fade-in">
      <Link href="/coach/challenge" className="text-sm text-neutral-500 hover:text-neutral-800">← 8-Week Challenge</Link>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <h1 className="text-h1 font-semibold">{r.full_name}</h1>
        {r.health_flag && <HealthBadge />}
      </div>
      <p className="text-sm text-neutral-500 mt-1">
        {r.age} years · {r.height_cm} cm · {r.weight_kg} kg · {r.main_goal}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href={waLink(r.phone)} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-dark hover:underline">WhatsApp {r.phone}</a>
        <a href={`mailto:${r.email}`} className="text-brand-dark hover:underline">{r.email}</a>
        {r.instagram && <a href={`https://instagram.com/${r.instagram}`} target="_blank" rel="noopener noreferrer" className="text-brand-dark hover:underline">@{r.instagram}</a>}
        {r.crm_contact_id && <Link href={`/coach/crm/contacts/${r.crm_contact_id}`} className="text-brand-dark hover:underline">CRM contact →</Link>}
      </div>
      <p className="text-2xs text-neutral-400 mt-2">
        Submitted {new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · all 4 agreements ticked
      </p>

      {yes.length > 0 && (
        <div className="mt-5 rounded-xl border border-ibf-red/30 bg-ibf-red-light p-4">
          <p className="text-sm font-semibold text-ibf-red">Answered Yes to a health question</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {yes.map((q) => {
              const detail = answers[`${q.id}_detail`];
              return (
                <li key={q.id}>
                  <span className="font-medium">{q.label}</span>
                  {detail && <span className="block whitespace-pre-wrap text-neutral-700">{detail}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-5 bg-surface border border-border rounded-xl p-4">
        <AssessmentAnswers answers={answers} sections={CHALLENGE_SECTIONS} />
      </div>
    </div>
  );
}
