'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { isVisible, MAX_TEXT, MAX_TEXTAREA, type Answers, type Question } from '@/lib/assessment/questions';
import { AGREEMENT_IDS, CHALLENGE_SECTIONS } from '@/lib/challenge/questions';
import { useSectionedForm } from '@/components/assessment/useSectionedForm';

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
            <h1 className="mt-3 text-[32px] font-bold leading-[1.1] tracking-tight sm:text-[38px]">You didn&apos;t wait for 2027.</h1>
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

function Card({ children }: { children: React.ReactNode }) {
  return <div className="assess-rise rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(51,63,110,0.08)] sm:p-8">{children}</div>;
}

function PrimaryButton({ children, onClick, disabled, className = '' }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-14 w-full rounded-2xl bg-[#26A88A] px-6 text-[16px] font-semibold text-white transition hover:bg-[#219578] active:scale-[0.98] disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
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

function groupHalves(qs: Question[]): Question[][] {
  const out: Question[][] = [];
  for (let i = 0; i < qs.length; i++) {
    if (qs[i].half && qs[i + 1]?.half) { out.push([qs[i], qs[i + 1]]); i++; }
    else out.push([qs[i]]);
  }
  return out;
}

const inputBase =
  'w-full rounded-2xl border bg-white px-4 text-[16px] text-[#333F6E] placeholder:text-[#333F6E]/35 outline-none transition focus:border-[#26A88A] focus:ring-4 focus:ring-[#26A88A]/15';

function Field({ q, answers, error, onChange }: {
  q: Question; answers: Answers; error?: string; onChange: (id: string, v: string) => void;
}) {
  const value = answers[q.id];
  const str = typeof value === 'string' ? value : '';
  const border = error ? 'border-[#E0705E]' : 'border-[#333F6E]/15';
  const inputId = `in-${q.id}`;

  // Single "I agree" option = an agreement checkbox.
  if (q.type === 'choice' && q.options?.length === 1) {
    const on = str === q.options[0];
    return (
      <div id={`q-${q.id}`}>
        <button
          type="button"
          role="checkbox"
          aria-checked={on}
          onClick={() => onChange(q.id, on ? '' : q.options![0])}
          className={`flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
            on ? 'border-[#26A88A] bg-[#26A88A]/[0.06]' : error ? 'border-[#E0705E] bg-white' : 'border-[#333F6E]/15 bg-white'
          }`}
        >
          <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${on ? 'border-[#26A88A] bg-[#26A88A]' : 'border-[#333F6E]/30 bg-white'}`}>
            {on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
          </span>
          <span className="text-[15px] leading-relaxed">{q.label}</span>
        </button>
        {error && <p className="mt-2 text-[14px] text-[#C2412D]">Please tick this box.</p>}
      </div>
    );
  }

  let control: React.ReactNode;
  switch (q.type) {
    case 'textarea':
      control = (
        <AutoTextarea id={inputId} value={str} placeholder={q.placeholder} className={`${inputBase} ${border} min-h-[96px] resize-none py-3.5 leading-relaxed`} onChange={(v) => onChange(q.id, v)} />
      );
      break;
    case 'yesno':
    case 'choice': {
      const options = q.type === 'yesno' ? ['Yes', 'No'] : q.options!;
      const short = options.every((o) => o.length <= 16);
      control = (
        <div role="radiogroup" aria-labelledby={`lbl-${q.id}`} className={`grid gap-2 ${short ? (options.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : options.length === 5 ? 'grid-cols-5' : 'grid-cols-2') : 'grid-cols-1'}`}>
          {options.map((o) => {
            const on = str === o;
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(q.id, o)}
                className={`min-h-14 rounded-2xl border px-4 py-3 text-[16px] transition active:scale-[0.98] ${short ? 'text-center' : 'text-left'} ${
                  on ? 'border-[#26A88A] bg-[#26A88A] font-semibold text-white' : `${error ? 'border-[#E0705E]' : 'border-[#333F6E]/15'} bg-white text-[#333F6E]`
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
      break;
    }
    case 'scale':
      control = <Slider id={inputId} value={str} error={!!error} labels={q.scaleLabels} onChange={(v) => onChange(q.id, v)} />;
      break;
    default: {
      const isNumber = q.type === 'number';
      control = (
        <div className="relative">
          <input
            id={inputId}
            type={isNumber ? 'text' : q.type}
            inputMode={isNumber ? (q.step && q.step < 1 ? 'decimal' : 'numeric') : undefined}
            autoComplete={q.autoComplete ?? 'off'}
            autoCapitalize={q.type === 'email' || q.id === 'instagram' ? 'none' : undefined}
            value={str}
            placeholder={q.placeholder}
            maxLength={MAX_TEXT}
            onChange={(e) => onChange(q.id, isNumber ? e.target.value.replace(',', '.').replace(/[^\d.]/g, '') : e.target.value)}
            className={`${inputBase} ${border} h-14 ${q.unit ? 'pr-16' : ''}`}
          />
          {q.unit && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[15px] text-[#333F6E]/45">{q.unit}</span>}
        </div>
      );
    }
  }

  const label = (
    <span id={`lbl-${q.id}`} className="block text-[16px] font-semibold leading-snug">
      {q.label}
      {!q.required && <span className="ml-1.5 text-[13px] font-normal text-[#333F6E]/45">optional</span>}
    </span>
  );

  return (
    <div id={`q-${q.id}`} className={q.when ? 'assess-rise' : ''}>
      {['textarea', 'text', 'email', 'tel', 'number'].includes(q.type) ? <label htmlFor={inputId}>{label}</label> : label}
      <div className="mt-2.5">{control}</div>
      {error && <p className="mt-2 text-[14px] text-[#C2412D]">{error}</p>}
    </div>
  );
}

// 1–10 slider. Starts unset (thumb greyed in the middle) so "required" means
// they actually chose a number; a tap on the track sets it too.
function Slider({ id, value, error, labels, onChange }: {
  id: string; value: string; error: boolean; labels?: [string, string]; onChange: (v: string) => void;
}) {
  const set = value !== '';
  const n = set ? Number(value) : 5;
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className={`text-[34px] font-bold tabular-nums leading-none ${set ? 'text-[#26A88A]' : 'text-[#333F6E]/25'}`}>{set ? n : '–'}</span>
        <span className="text-[15px] text-[#333F6E]/50">/ 10</span>
        {!set && <span className={`ml-auto text-[14px] ${error ? 'text-[#C2412D]' : 'text-[#333F6E]/50'}`}>Slide to choose</span>}
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={10}
        step={1}
        value={n}
        onChange={(e) => onChange(e.target.value)}
        onPointerUp={(e) => onChange((e.target as HTMLInputElement).value)}
        className={`challenge-range h-10 w-full ${set ? '' : 'is-unset'}`}
        style={{ ['--fill' as string]: `${((n - 1) / 9) * 100}%` }}
      />
      {labels && (
        <div className="mt-1 flex justify-between text-[13px] text-[#333F6E]/55">
          <span>1 · {labels[0]}</span>
          <span>{labels[1]} · 10</span>
        </div>
      )}
    </div>
  );
}

function AutoTextarea({ value, onChange, className, ...rest }: {
  id: string; value: string; placeholder?: string; className: string; onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} rows={3} maxLength={MAX_TEXTAREA} value={value} onChange={(e) => onChange(e.target.value)} className={className} {...rest} />;
}
