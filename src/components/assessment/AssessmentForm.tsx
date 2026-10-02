'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  SECTIONS, isVisible, validateSection, MAX_TEXT, MAX_TEXTAREA,
  type Answers, type Question,
} from '@/lib/assessment/questions';

// Progress lives in localStorage so an accidental refresh (or closing the
// tab and coming back later) picks up where the client left off. Cleared
// after a successful submit.
const STORAGE_KEY = 'vitality-assessment-v1';

type Saved = { answers: Answers; step: number; submissionId: string };

function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID is missing on plain-http origins (e.g. testing over LAN).
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const TOTAL = SECTIONS.length;

function loadSaved(): Saved & { resumed: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Saved | null;
    if (saved?.submissionId) {
      const answers = saved.answers || {};
      return { answers, step: Math.min(Math.max(saved.step || 0, 0), TOTAL), submissionId: saved.submissionId, resumed: Object.keys(answers).length > 0 };
    }
  } catch {}
  return { answers: {}, step: 0, submissionId: newId(), resumed: false };
}

// Rendered client-only (see AssessmentFormLoader) so saved progress can be
// read straight from localStorage on first render.
export default function AssessmentForm() {
  const [initial] = useState(loadSaved);
  // step 0 = welcome screen, 1..TOTAL = sections
  const [step, setStep] = useState(initial.step);
  const [answers, setAnswers] = useState<Answers>(initial.answers);
  const submissionId = initial.submissionId;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [resumed, setResumed] = useState(initial.resumed);
  const honeypot = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (done) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, step, submissionId } satisfies Saved));
    } catch {
      // storage full / disabled (private mode) — the form still works, it
      // just won't survive a refresh.
    }
  }, [answers, step, submissionId, done]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, done]);

  function setAnswer(id: string, value: string | string[]) {
    setAnswers((a) => ({ ...a, [id]: value }));
    if (errors[id]) {
      setErrors((e) => {
        const rest = { ...e };
        delete rest[id];
        return rest;
      });
    }
  }

  function scrollToFirstError(errs: Record<string, string>) {
    const section = SECTIONS[step - 1];
    const first = section?.questions.find((q) => errs[q.id]);
    if (!first) return;
    requestAnimationFrame(() => {
      document.getElementById(`q-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function next() {
    if (step > 0) {
      const errs = validateSection(SECTIONS[step - 1], answers);
      if (Object.keys(errs).length) {
        setErrors(errs);
        scrollToFirstError(errs);
        return;
      }
    }
    setErrors({});
    setResumed(false);
    setStep((s) => Math.min(s + 1, TOTAL));
  }

  function back() {
    setErrors({});
    setSubmitError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    if (submitting) return;
    const errs = validateSection(SECTIONS[TOTAL - 1], answers);
    if (Object.keys(errs).length) {
      setErrors(errs);
      scrollToFirstError(errs);
      return;
    }
    if (!confirmed) {
      setSubmitError('Please tick the confirmation box above to continue.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, answers, confirmed, company: honeypot.current?.value || '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
        setDone(true);
        return;
      }
      if (res.status === 422 && data.errors) {
        // Server found something the browser missed (e.g. an earlier
        // section) — take them straight to it.
        setErrors(data.errors);
        setStep((data.section ?? TOTAL - 1) + 1);
        setSubmitError(null);
        return;
      }
      setSubmitError(data.error || 'Something went wrong. Please try again.');
    } catch {
      setSubmitError("We couldn't reach the server. Check your connection and try again — your answers are saved.");
    } finally {
      setSubmitting(false);
    }
  }

  const section = step > 0 ? SECTIONS[step - 1] : null;
  const progress = done ? 100 : Math.round(((step - 1) / TOTAL) * 100);

  return (
    <div className="relative min-h-screen w-full bg-[#fbfdfd] text-neutral-900">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(76,184,230,0.14),transparent_60%),radial-gradient(ellipse_at_top_right,rgba(15,168,166,0.12),transparent_55%)]" />

      <header className="relative mx-auto flex max-w-2xl items-center gap-3 px-5 pt-6 sm:pt-10">
        <Image src="/vitality-logo.png" alt="" width={30} height={24} priority />
        <div className="leading-none">
          <div className="text-[15px] font-semibold tracking-[0.28em] text-neutral-900">VITALITY</div>
          <div className="mt-1 text-[10px] font-medium tracking-[0.3em] text-brand">1-1 COACHING</div>
        </div>
      </header>

      {step > 0 && !done && (
        <div className="sticky top-0 z-20 mt-4 border-b border-neutral-100 bg-white/85 backdrop-blur-md">
          <div className="mx-auto max-w-2xl px-5 py-3">
            <div className="mb-2 flex items-baseline justify-between text-xs">
              <span className="font-medium text-neutral-700">
                <span className="text-neutral-400">Section {step} of {TOTAL} · </span>{section?.title}
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Section {step}</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-tight sm:text-3xl">{section.title}</h2>
            {resumed && (
              <p className="mt-3 text-sm text-neutral-500">Welcome back — we saved your progress.</p>
            )}
            {section.intro && (
              <p className="mt-5 rounded-2xl border border-brand/15 bg-brand-light/60 px-4 py-3.5 text-sm leading-relaxed text-brand-dark">
                {section.intro}
              </p>
            )}

            <div className="mt-8 flex flex-col gap-7">
              {groupHalves(section.questions.filter((q) => isVisible(q, answers))).map((group) =>
                group.length === 2 ? (
                  <div key={group[0].id} className="grid gap-7 sm:grid-cols-2 sm:gap-4">
                    {group.map((q) => <Field key={q.id} q={q} value={answers[q.id]} error={errors[q.id]} onChange={setAnswer} />)}
                  </div>
                ) : (
                  <Field key={group[0].id} q={group[0]} value={answers[group[0].id]} error={errors[group[0].id]} onChange={setAnswer} />
                )
              )}
            </div>

            {step === TOTAL && (
              <label className="mt-10 flex cursor-pointer items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => { setConfirmed(e.target.checked); setSubmitError(null); }}
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
                      Submitting…
                    </span>
                  ) : (
                    'Complete My Assessment'
                  )}
                </PrimaryButton>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
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

function Welcome({ onStart, resumed }: { onStart: () => void; resumed: boolean }) {
  return (
    <div className="assess-rise pt-14 sm:pt-20">
      <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-5xl">
        Let&apos;s build your <span className="assess-gradient bg-clip-text text-transparent">roadmap.</span>
      </h1>
      <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-neutral-600">
        Before we get started, we want to understand you properly. Your goals, lifestyle, nutrition, training and current starting point will help us build your personalised Vitality roadmap.
      </p>

      <div className="mt-8 grid grid-cols-3 gap-3 text-center">
        {[
          ['10–15', 'minutes'],
          [String(TOTAL), 'short sections'],
          ['Auto', 'saves as you go'],
        ].map(([big, small]) => (
          <div key={small} className="rounded-2xl border border-neutral-100 bg-white px-2 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="text-lg font-semibold text-neutral-900">{big}</div>
            <div className="mt-0.5 text-xs text-neutral-500">{small}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 flex">
        <PrimaryButton onClick={onStart}>{resumed ? 'Continue where I left off' : 'Start my assessment'}</PrimaryButton>
      </div>
      <p className="mt-4 text-center text-xs text-neutral-400">Your answers are private and only shared with your Vitality coach.</p>
    </div>
  );
}

function Success() {
  return (
    <div className="assess-rise pt-16 sm:pt-24">
      <div className="assess-gradient flex h-14 w-14 items-center justify-center rounded-full shadow-[0_10px_30px_-10px_rgba(15,168,166,0.7)]">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      <h1 className="mt-7 text-[40px] font-semibold leading-tight tracking-tight sm:text-5xl">You&apos;re all set.</h1>
      <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-neutral-600">
        Your coach will review your assessment before your onboarding session and use it to begin building your personalised Vitality Roadmap.
      </p>

      <div className="mt-10 rounded-3xl border border-neutral-100 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">What happens next</p>
        <ol className="mt-5 flex flex-col gap-5">
          {[
            'We review your assessment',
            'We prepare your starting roadmap',
            'We go through everything together during your onboarding session',
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

const inputBase =
  'w-full rounded-2xl border bg-white px-4 text-base text-neutral-900 placeholder:text-neutral-400 shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10';

function Field({ q, value, error, onChange }: {
  q: Question;
  value: string | string[] | undefined;
  error?: string;
  onChange: (id: string, v: string | string[]) => void;
}) {
  if (q.type === 'note') {
    return (
      <p className="assess-rise rounded-2xl border border-brand/15 bg-brand-light/60 px-4 py-3.5 text-sm text-brand-dark">{q.label}</p>
    );
  }

  const str = typeof value === 'string' ? value : '';
  const arr = Array.isArray(value) ? value : [];
  const border = error ? 'border-red-300' : 'border-neutral-200';
  const inputId = `in-${q.id}`;

  let control: React.ReactNode;
  switch (q.type) {
    case 'textarea':
      control = (
        <AutoTextarea
          id={inputId}
          value={str}
          placeholder={q.placeholder}
          maxLength={MAX_TEXTAREA}
          rows={q.highlight ? 5 : 3}
          className={`${inputBase} ${border} resize-none py-3.5 leading-relaxed`}
          onChange={(v) => onChange(q.id, v)}
        />
      );
      break;
    case 'yesno':
    case 'choice': {
      const options = q.type === 'yesno' ? ['Yes', 'No'] : q.options!;
      const tiles = options.length === 2 || options.every((o) => o.length <= 3);
      control = (
        <div role="radiogroup" aria-labelledby={`lbl-${q.id}`} className={tiles ? `grid gap-2 ${options.length === 2 ? 'grid-cols-2' : 'grid-cols-4 sm:grid-cols-7'}` : 'flex flex-wrap gap-2'}>
          {options.map((o) => (
            <OptionButton key={o} selected={str === o} error={!!error} onClick={() => onChange(q.id, str === o && !q.required ? '' : o)} wide={tiles}>
              {o}
            </OptionButton>
          ))}
        </div>
      );
      break;
    }
    case 'multi':
      control = (
        <div className="flex flex-wrap gap-2" aria-labelledby={`lbl-${q.id}`}>
          {q.options!.map((o) => {
            const on = arr.includes(o);
            return (
              <OptionButton key={o} selected={on} error={!!error} checkbox onClick={() => onChange(q.id, on ? arr.filter((x) => x !== o) : [...arr, o])}>
                <span className="flex items-center gap-2">
                  <span className={`flex h-4 w-4 items-center justify-center rounded-[5px] border transition ${on ? 'border-transparent bg-brand' : 'border-neutral-300 bg-white'}`}>
                    {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                  </span>
                  {o}
                </span>
              </OptionButton>
            );
          })}
        </div>
      );
      break;
    case 'scale':
      control = (
        <div>
          <div role="radiogroup" aria-labelledby={`lbl-${q.id}`} className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
              <OptionButton key={n} selected={str === n} error={!!error} onClick={() => onChange(q.id, n)} wide>
                <span className="tabular-nums">{n}</span>
              </OptionButton>
            ))}
          </div>
          {q.scaleLabels && (
            <div className="mt-2 flex justify-between text-xs text-neutral-400">
              <span>1 · {q.scaleLabels[0]}</span>
              <span>{q.scaleLabels[1]} · 10</span>
            </div>
          )}
        </div>
      );
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
            value={str}
            placeholder={q.placeholder}
            maxLength={MAX_TEXT}
            max={q.type === 'date' ? new Date().toISOString().slice(0, 10) : undefined}
            onChange={(e) => onChange(q.id, isNumber ? e.target.value.replace(',', '.').replace(/[^\d.]/g, '') : e.target.value)}
            className={`${inputBase} ${border} h-14 ${q.unit ? 'pr-16' : ''} ${q.type === 'date' || q.type === 'time' ? 'appearance-none text-left' : ''}`}
          />
          {q.unit && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-neutral-400">{q.unit}</span>}
        </div>
      );
    }
  }

  const labelEl = q.highlight ? (
    <span id={`lbl-${q.id}`} className="block text-xl font-semibold leading-snug tracking-tight text-neutral-900 sm:text-2xl">{q.label}</span>
  ) : (
    <span id={`lbl-${q.id}`} className="block text-[15px] font-medium leading-snug text-neutral-900">
      {q.label}
      {!q.required && q.hint !== 'Optional' && q.type !== 'yesno' && <span className="ml-1.5 text-xs font-normal text-neutral-400">optional</span>}
    </span>
  );

  const body = (
    <>
      {['textarea', 'text', 'email', 'tel', 'date', 'number', 'time'].includes(q.type) ? (
        <label htmlFor={inputId}>{labelEl}</label>
      ) : labelEl}
      {q.hint && <p className="mt-1 text-sm leading-relaxed text-neutral-500">{q.hint}</p>}
      <div className="mt-3">{control}</div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  );

  if (q.highlight) {
    return (
      <div id={`q-${q.id}`} className="assess-gradient mt-4 rounded-[28px] p-[1.5px] shadow-[0_20px_50px_-24px_rgba(15,168,166,0.55)]">
        <div className="rounded-[27px] bg-white p-5 sm:p-7">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand">Final question</p>
          {body}
        </div>
      </div>
    );
  }

  return <div id={`q-${q.id}`} className={q.when ? 'assess-rise' : ''}>{body}</div>;
}

function OptionButton({ children, selected, error, onClick, wide, checkbox }: {
  children: React.ReactNode; selected: boolean; error: boolean; onClick: () => void; wide?: boolean; checkbox?: boolean;
}) {
  return (
    <button
      type="button"
      role={checkbox ? 'checkbox' : 'radio'}
      aria-checked={selected}
      onClick={onClick}
      className={`min-h-12 rounded-2xl border px-4 py-2.5 text-[15px] transition active:scale-[0.98] ${wide ? 'w-full' : ''} ${
        selected
          ? 'border-brand bg-brand-light/70 font-medium text-brand-dark shadow-[0_0_0_3px_rgba(15,168,166,0.10)]'
          : `${error ? 'border-red-300' : 'border-neutral-200'} bg-white text-neutral-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-neutral-300`
      }`}
    >
      {children}
    </button>
  );
}

function AutoTextarea({ value, onChange, className, ...rest }: {
  id: string; value: string; placeholder?: string; maxLength: number; rows: number; className: string; onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} className={className} {...rest} />;
}
