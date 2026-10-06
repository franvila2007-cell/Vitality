'use client';

import { useEffect, useRef } from 'react';
import { isVisible, MAX_TEXT, MAX_TEXTAREA, type Answers, type Question } from '@/lib/assessment/questions';

// Answer controls shared by every public multi-section form (/assessment,
// /ironbodyfit-meal-plans): text inputs, option tiles, multi-selects and 1–10 scales,
// rendered straight from the question schema.

// Renders a section's visible questions, pairing up consecutive `half`
// questions side-by-side on wider screens.
export function QuestionList({ questions, answers, errors, onChange }: {
  questions: Question[];
  answers: Answers;
  errors: Record<string, string>;
  onChange: (id: string, v: string | string[]) => void;
}) {
  return (
    <div className="mt-8 flex flex-col gap-7">
      {groupHalves(questions.filter((q) => isVisible(q, answers))).map((group) =>
        group.length === 2 ? (
          <div key={group[0].id} className="grid gap-7 sm:grid-cols-2 sm:gap-4">
            {group.map((q) => <Field key={q.id} q={q} value={answers[q.id]} error={errors[q.id]} onChange={onChange} />)}
          </div>
        ) : (
          <Field key={group[0].id} q={group[0]} value={answers[group[0].id]} error={errors[group[0].id]} onChange={onChange} />
        )
      )}
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
