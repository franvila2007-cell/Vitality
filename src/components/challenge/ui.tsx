'use client';

import { useEffect, useRef } from 'react';
import { MAX_TEXT, MAX_TEXTAREA, type Answers, type Question } from '@/lib/assessment/questions';

// Shared look for the 8-Week Challenge pages (/challenge/intake and
// /challenge/check-in): white card, teal button and the answer controls,
// rendered from the same question schema as every other public form.

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="assess-rise rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(51,63,110,0.08)] sm:p-8">{children}</div>;
}

export function PrimaryButton({ children, onClick, disabled, className = '' }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
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

export function groupHalves(qs: Question[]): Question[][] {
  const out: Question[][] = [];
  for (let i = 0; i < qs.length; i++) {
    if (qs[i].half && qs[i + 1]?.half) { out.push([qs[i], qs[i + 1]]); i++; }
    else out.push([qs[i]]);
  }
  return out;
}

export const inputBase =
  'w-full rounded-2xl border bg-white px-4 text-[16px] text-[#333F6E] placeholder:text-[#333F6E]/35 outline-none transition focus:border-[#26A88A] focus:ring-4 focus:ring-[#26A88A]/15';

export function Field({ q, answers, error, onChange }: {
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
        <div role="radiogroup" aria-labelledby={`lbl-${q.id}`} className={`grid gap-2 ${short ? (options.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : options.length === 5 ? 'grid-cols-5' : options.length > 5 ? 'grid-cols-4' : 'grid-cols-2') : 'grid-cols-1'}`}>
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
      // A percentage (e.g. "how closely you followed your plan") is a 0–100 slider.
      if (q.type === 'number' && q.unit === '%') {
        control = <Slider id={inputId} value={str} error={!!error} labels={q.scaleLabels} min={q.min ?? 0} max={q.max ?? 100} step={q.step ?? 5} suffix="%" onChange={(v) => onChange(q.id, v)} />;
        break;
      }
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
      {q.hint && <p className="mt-1 text-[14px] leading-relaxed text-[#333F6E]/60">{q.hint}</p>}
      <div className="mt-2.5">{control}</div>
      {error && <p className="mt-2 text-[14px] text-[#C2412D]">{error}</p>}
    </div>
  );
}

// 1–10 slider (or any range, e.g. 0–100%). Starts unset (thumb greyed in the
// middle) so "required" means they actually chose a number; a tap on the
// track sets it too.
export function Slider({ id, value, error, labels, onChange, min = 1, max = 10, step = 1, suffix }: {
  id: string; value: string; error: boolean; labels?: [string, string]; onChange: (v: string) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  const set = value !== '';
  const mid = Math.round((min + max) / 2 / step) * step;
  const n = set ? Number(value) : mid;
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className={`text-[34px] font-bold tabular-nums leading-none ${set ? 'text-[#26A88A]' : 'text-[#333F6E]/25'}`}>{set ? n : '–'}{suffix && set ? suffix : ''}</span>
        {!suffix && <span className="text-[15px] text-[#333F6E]/50">/ {max}</span>}
        {!set && <span className={`ml-auto text-[14px] ${error ? 'text-[#C2412D]' : 'text-[#333F6E]/50'}`}>Slide to choose</span>}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={n}
        onChange={(e) => onChange(e.target.value)}
        onPointerUp={(e) => onChange((e.target as HTMLInputElement).value)}
        className={`challenge-range h-10 w-full ${set ? '' : 'is-unset'}`}
        style={{ ['--fill' as string]: `${((n - min) / (max - min)) * 100}%` }}
      />
      {labels && (
        <div className="mt-1 flex justify-between text-[13px] text-[#333F6E]/55">
          <span>{min}{suffix} · {labels[0]}</span>
          <span>{labels[1]} · {max}{suffix}</span>
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
