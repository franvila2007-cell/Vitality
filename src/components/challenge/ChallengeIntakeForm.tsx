'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { isVisible } from '@/lib/assessment/questions';
import { AGREEMENT_IDS, CHALLENGE_SECTIONS } from '@/lib/challenge/questions';
import { useSectionedForm } from '@/components/assessment/useSectionedForm';
import { Card, Field, PrimaryButton, groupHalves } from './ui';

// 8-Week Challenge intake (/challenge/intake). Same engine as the other public
// forms (useSectionedForm: per-step validation, localStorage autosave,
// honeypot, submit) with its own flat Vitality look: mint page, white cards,
// teal actions, navy text. Rendered client-only (see ChallengeIntakeLoader).

const TOTAL = CHALLENGE_SECTIONS.length;

export default function ChallengeIntakeForm({ whatsappUrl }: { whatsappUrl: string }) {
  const {
    step, section, answers, errors, submitting, submitError, done, resumed, honeypot,
    setAnswer, setConfirmed, next, back, submit,
  } = useSectionedForm({ sections: CHALLENGE_SECTIONS, storageKey: 'vitality-challenge-intake-oct-2026', endpoint: '/api/challenge/intake' });

  // The four agreement boxes are the form's confirmation.
  const allAgreed = AGREEMENT_IDS.every((id) => answers[id] === 'I agree');
  useEffect(() => { setConfirmed(allAgreed); }, [allAgreed]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLast = step === TOTAL;
  const progress = done ? 100 : Math.round((step / TOTAL) * 100);

  return (
    <div className="min-h-dvh w-full bg-[#D6F5EE] text-[#333F6E]">
      <header className="flex justify-center px-4 pt-6 pb-2">
        <Image src="/vitality-logo.png" alt="Vitality" width={44} height={35} priority />
      </header>

      {step > 0 && !done && (
        <div className="sticky top-0 z-20 bg-[#D6F5EE]/95 backdrop-blur-sm">
          <div className="mx-auto max-w-xl px-4 py-3">
            <div className="mb-2 flex items-baseline justify-between text-[13px]">
              <span className="font-semibold">{section?.title}</span>
              <span className="tabular-nums text-[#333F6E]/60">Step {step} of {TOTAL}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-[#26A88A] transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-xl px-4 pb-16 pt-4">
        {done ? (
          <ThankYou whatsappUrl={whatsappUrl} />
        ) : step === 0 ? (
          <Card key="welcome">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#26A88A]">8-Week Challenge</p>
            <p className="mt-3 text-[20px] font-bold text-[#26A88A]">Welcome, you&apos;re in!</p>
            <h1 className="mt-2 text-[32px] font-bold leading-[1.1] tracking-tight sm:text-[38px]">You didn&apos;t wait for 2027.</h1>
            <p className="mt-4 text-[17px] leading-relaxed text-[#333F6E]/80">
              Well done. Most people are still waiting for January. You&apos;ve already started. This takes about 5 minutes and helps us build your 8 weeks around you.
            </p>
            {resumed && <p className="mt-4 text-[15px] font-medium text-[#26A88A]">Welcome back, your answers are saved.</p>}
            <PrimaryButton onClick={next} className="mt-8">{resumed ? 'Continue' : "Let's go"}</PrimaryButton>
          </Card>
        ) : section ? (
          <Card key={section.id}>
            <h2 className="text-[26px] font-bold leading-tight tracking-tight">{section.title}</h2>
            {section.id === 'health' && <p className="mt-1 text-[13px] font-medium text-[#333F6E]/60">All questions required</p>}
            {resumed && step > 0 && <p className="mt-2 text-[14px] text-[#26A88A]">Welcome back, your answers are saved.</p>}
            {section.intro && <p className="mt-3 text-[15px] leading-relaxed text-[#333F6E]/75">{section.intro}</p>}

            <div className="mt-7 flex flex-col gap-7">
              {groupHalves(section.questions.filter((q) => isVisible(q, answers))).map((group) =>
                group.length === 2 ? (
                  <div key={group[0].id} className="grid grid-cols-2 gap-3">
                    {group.map((q) => <Field key={q.id} q={q} answers={answers} error={errors[q.id]} onChange={setAnswer} />)}
                  </div>
                ) : (
                  <Field key={group[0].id} q={group[0]} answers={answers} error={errors[group[0].id]} onChange={setAnswer} />
                )
              )}
            </div>

            <input ref={honeypot} type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />

            {Object.keys(errors).length > 0 && <p className="mt-6 text-[15px] text-[#C2412D]" role="alert">Please check the highlighted answers.</p>}
            {submitError && isLast && <p className="mt-6 rounded-xl bg-[#FDECEA] px-4 py-3 text-[15px] text-[#A3321F]" role="alert">{submitError}</p>}

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={back}
                className="h-14 shrink-0 rounded-2xl border border-[#333F6E]/15 bg-white px-5 text-[16px] font-semibold text-[#333F6E] transition active:scale-[0.98]"
              >
                Back
              </button>
              <PrimaryButton onClick={isLast ? submit : next} disabled={submitting} className="flex-1">
                {isLast ? (submitting ? 'Sending…' : 'Submit') : 'Continue'}
              </PrimaryButton>
            </div>
          </Card>
        ) : null}
      </main>
    </div>
  );
}

function ThankYou({ whatsappUrl }: { whatsappUrl: string }) {
  return (
    <Card>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#26A88A]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      <h1 className="mt-6 text-[30px] font-bold leading-[1.15] tracking-tight">You&apos;re in. Welcome to the 8 weeks.</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-[#333F6E]/80">
        Next step: join the Vitality WhatsApp community below. Send your starting photos (front, side, back) to us privately on WhatsApp before 26 October. Week 1 starts Monday 26 October.
      </p>
      {whatsappUrl ? (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-[#26A88A] px-6 text-[16px] font-semibold text-white transition hover:bg-[#219578] active:scale-[0.98]"
        >
          Join the WhatsApp community
        </a>
      ) : (
        <p className="mt-8 rounded-2xl bg-[#D6F5EE] px-4 py-3.5 text-[15px] font-medium">We&apos;ll send you the WhatsApp community link shortly.</p>
      )}
    </Card>
  );
}
