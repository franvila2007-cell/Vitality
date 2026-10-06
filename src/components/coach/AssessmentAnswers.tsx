import { SECTIONS, type Answers, type Section } from '@/lib/assessment/questions';

// Prints a submitted onboarding assessment back in question order, grouped
// by section. Shared by /coach/assessments and each client's detail page;
// /coach/meal-plans passes its own sections.
export default function AssessmentAnswers({ answers, sections = SECTIONS }: { answers: Answers; sections?: Section[] }) {
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => {
        const qs = section.questions.filter((q) => q.type !== 'note' && answers[q.id] !== undefined);
        if (!qs.length) return null;
        return (
          <section key={section.id}>
            <h2 className="text-3xs font-semibold uppercase tracking-wider text-brand mb-2">{section.title}</h2>
            <dl className="flex flex-col gap-3">
              {qs.map((q) => {
                const v = answers[q.id];
                return (
                  <div key={q.id}>
                    <dt className="text-2xs text-neutral-500">{q.label}</dt>
                    <dd className="text-sm whitespace-pre-wrap">
                      {Array.isArray(v) ? v.join(', ') : v}
                      {q.unit && !Array.isArray(v) ? ` ${q.unit}` : ''}
                      {q.type === 'scale' ? ' / 10' : ''}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
