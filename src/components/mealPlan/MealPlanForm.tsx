'use client';

import Image from 'next/image';
import { MEAL_PLAN_SECTIONS } from '@/lib/mealPlan/questions';
import { useSectionedForm } from '@/components/assessment/useSectionedForm';
import { QuestionList } from '@/components/assessment/fields';

const TOTAL = MEAL_PLAN_SECTIONS.length;

// IronBodyFit meal-plan request form, co-branded Vitality × IronBodyFit.
// Vitality teal leads (buttons, selections, focus); IronBodyFit red is kept
// to accents — the "×", the top stripe, section numbers — so the two brands
// sit together without the page turning into a red/teal clash.
// Rendered client-only (see MealPlanFormLoader) so saved progress can be
// read straight from localStorage on first render.
export default function MealPlanForm() {
  const {
    step, section, progress, answers, errors, confirmed, submitting, submitError, done, resumed, honeypot,
    setAnswer, setConfirmed, next, back, submit,
  } = useSectionedForm({ sections: MEAL_PLAN_SECTIONS, storageKey: 'ibf-meal-plan-v1', endpoint: '/api/meal-plan' });

  return (
    <div className="relative min-h-screen w-full bg-[#fbfdfd] text-neutral-900">
      <div aria-hidden className="collab-gradient absolute inset-x-0 top-0 h-1" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(ellipse_at_top_left,rgba(15,168,166,0.15),transparent_60%),radial-gradient(ellipse_at_top_right,rgba(227,23,62,0.07),transparent_55%)]" />

      <header className="relative mx-auto flex max-w-2xl items-center justify-between px-5 pt-6 sm:pt-10">
        <CollabMark />
        <span className="rounded-full border border-neutral-200 bg-white/70 px-3 py-1 text-[11px] font-medium tracking-wide text-neutral-500">
          Meal Plans
        </span>
      </header>

      {step > 0 && !done && (
        <div className="sticky top-0 z-20 mt-4 border-b border-neutral-100 bg-white/85 backdrop-blur-md">
          <div className="mx-auto max-w-2xl px-5 py-3">
            <div className="mb-2 flex items-baseline justify-between text-xs">
              <span className="font-medium text-neutral-700">
                <span className="text-neutral-400">Step {step} of {TOTAL} · </span>{section?.title}
              </span>
              <span className="tabular-nums text-neutral-400">{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="assess-gradient h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${Math.max(progress, 3)}%` }} />
            </div>
          </div>
        </div>
      )}

      <main className="relative mx-auto max-w-2xl px-5 pb-24">
        {done ? (
          <Success />
        ) : step === 0 ? (
          <Welcome onStart={next} resumed={resumed} />
        ) : section ? (
          <div key={section.id} className="assess-rise pt-8 sm:pt-10">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ibf-red">
              <span className="h-1.5 w-1.5 rounded-full bg-ibf-red" />
              Step {step}
            </p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-tight sm:text-3xl">{section.title}</h2>
            {resumed && (
              <p className="mt-3 text-sm text-neutral-500">Welcome back, we saved your progress.</p>
            )}
            {section.intro && (
              <p className="mt-5 rounded-2xl border border-brand/15 bg-brand-light/60 px-4 py-3.5 text-sm leading-relaxed text-brand-dark">
                {section.intro}
              </p>
            )}

            <QuestionList questions={section.questions} answers={answers} errors={errors} onChange={setAnswer} />

            {step === TOTAL && (
              <label className="mt-10 flex cursor-pointer items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
                />
                <span className="text-sm leading-relaxed text-neutral-700">
                  I confirm that the information I&apos;ve provided is accurate to the best of my knowledge.
                </span>
              </label>
            )}

            {/* Honeypot — hidden from people, filled in by spam bots. */}
            <input ref={honeypot} type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />

            {Object.keys(errors).length > 0 && (
              <p className="mt-8 text-sm text-red-600" role="alert">Please answer the highlighted questions before continuing.</p>
            )}
            {submitError && (
              <p className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{submitError}</p>
            )}

            <div className="mt-8 flex items-center gap-3">
              <button
                type="button"
                onClick={back}
                disabled={submitting}
                className="h-14 rounded-2xl px-5 text-sm font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-40"
              >
                Back
              </button>
              {step < TOTAL ? (
                <PrimaryButton onClick={next}>Continue</PrimaryButton>
              ) : (
                <PrimaryButton onClick={submit} disabled={submitting}>
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Sending…
                    </span>
                  ) : (
                    'Send my answers'
                  )}
                </PrimaryButton>
              )}
            </div>
          </div>
        ) : null}
      </main>

      <footer className="relative pb-8 text-center text-[11px] tracking-wide text-neutral-400">
        IronBodyFit Meal Plans · Powered by <span className="font-semibold text-brand-dark">Vitality Malta</span>
      </footer>
    </div>
  );
}

// Vitality logo × IronBodyFit shield, echoing the collaboration artwork.
function CollabMark() {
  return (
    <div className="flex items-center gap-3" aria-label="Vitality × IronBodyFit">
      <Image src="/vitality-logo.png" alt="Vitality" width={34} height={27} priority />
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <defs>
          <linearGradient id="collab-x" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="100%" stopColor="var(--ibf-red)" />
          </linearGradient>
        </defs>
        <path d="M2 2l10 10M12 2L2 12" stroke="url(#collab-x)" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <Image src="/ironbodyfit-logo.png" alt="IronBodyFit" width={31} height={28} priority />
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="assess-gradient h-14 flex-1 rounded-2xl px-6 text-[15px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(15,168,166,0.55)] transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {children}
    </button>
  );
}

const PILLARS = [
  {
    title: 'Lose fat',
    icon: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.6 2.2-4.6.3 1.6 1.1 2.6 2.3 3.1C11 9 11 6 12 3z" />,
    tone: 'bg-ibf-red-light text-ibf-red',
  },
  {
    title: 'Build muscle',
    icon: <path d="M6.5 8v8M17.5 8v8M4 10v4M20 10v4M6.5 12h11" />,
    tone: 'bg-brand-light text-brand-dark',
  },
  {
    title: 'Optimise EMS',
    icon: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />,
    tone: 'bg-[#e6f4fb] text-[#2a8fbf]',
  },
];

function Welcome({ onStart, resumed }: { onStart: () => void; resumed: boolean }) {
  return (
    <div className="assess-rise pt-12 sm:pt-16">
      <p className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/80 px-3 py-1 text-xs font-medium text-neutral-600">
        <span className="h-1.5 w-1.5 rounded-full bg-ibf-red" />
        For IronBodyFit Malta members
      </p>
      <h1 className="mt-5 text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-5xl">
        IronBodyFit <span className="assess-gradient bg-clip-text text-transparent">Meal Plans</span>
      </h1>
      <p className="mt-2 text-sm font-medium tracking-wide text-neutral-500">
        Powered by <span className="text-brand-dark">Vitality</span>
      </p>
      <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-neutral-600">
        A form created by Vitality Malta for IronBodyFit members. Your answers help us build a meal plan that helps you lose fat, build muscle and look after your health, while getting the most out of your EMS training.
      </p>

      <div className="mt-8 grid grid-cols-3 gap-3">
        {PILLARS.map((p) => (
          <div key={p.title} className="flex flex-col items-center gap-2.5 rounded-2xl border border-neutral-100 bg-white px-2 py-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <span className={`flex h-10 w-10 items-center justify-center rounded-full ${p.tone}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p.icon}</svg>
            </span>
            <span className="text-[13px] font-medium text-neutral-800">{p.title}</span>
          </div>
        ))}
      </div>

      <div className="mt-10 flex">
        <PrimaryButton onClick={onStart}>{resumed ? 'Continue where I left off' : 'Start'}</PrimaryButton>
      </div>
      <p className="mt-4 text-center text-xs text-neutral-400">
        About 5 minutes · {TOTAL} short steps · saves as you go
      </p>
    </div>
  );
}

function Success() {
  return (
    <div className="assess-rise pt-16 sm:pt-24">
      <div className="assess-gradient flex h-14 w-14 items-center justify-center rounded-full shadow-[0_10px_30px_-10px_rgba(15,168,166,0.7)]">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      <h1 className="mt-7 text-[40px] font-semibold leading-tight tracking-tight sm:text-5xl">Thank you!</h1>
      <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-neutral-600">
        Your answers are with the Vitality team. We&apos;ll use them to build your personalised IronBodyFit meal plan.
      </p>

      <div className="mt-10 rounded-3xl border border-neutral-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ibf-red">What happens next</p>
        <ol className="mt-5 flex flex-col gap-5">
          {[
            'We review your answers',
            'We build your meal plan around your goals and EMS training',
            'We send it to you by email',
          ].map((text, i) => (
            <li key={text} className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light text-sm font-semibold text-brand-dark">{i + 1}</span>
              <span className="pt-1 text-[15px] text-neutral-800">{text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
