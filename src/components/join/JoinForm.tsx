'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { validateSection, type Answers } from '@/lib/assessment/questions';
import { JOIN_SECTIONS } from '@/lib/crm/joinQuestions';
import { QuestionList } from '@/components/assessment/fields';

const SECTION = JOIN_SECTIONS[0];

function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Public one-page lead form (/join). Same look and answer controls as the
// other Vitality forms; posts to /api/join with the link's ?src= so every
// lead lands in the CRM tagged with where it came from.
export default function JoinForm({ src }: { src: string }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submissionId] = useState(newId);
  const honeypot = useRef<HTMLInputElement>(null);

  function setAnswer(id: string, v: string | string[]) {
    setAnswers((a) => ({ ...a, [id]: v }));
    if (errors[id]) setErrors((e) => { const r = { ...e }; delete r[id]; return r; });
  }

  async function submit() {
    if (submitting) return;
    const errs = validateSection(SECTION, answers);
    if (Object.keys(errs).length) {
      setErrors(errs);
      const first = SECTION.questions.find((q) => errs[q.id]);
      if (first) document.getElementById(`q-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!consent) { setSubmitError('Please tick the box so we can get in touch.'); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/join${src ? `?src=${encodeURIComponent(src)}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, answers, confirmed: true, company: honeypot.current?.value || '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setDone(true); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      if (res.status === 422 && data.errors) { setErrors(data.errors); return; }
      setSubmitError(data.error || 'Something went wrong. Please try again.');
    } catch {
      setSubmitError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-[#fbfdfd] text-neutral-900">
      <div aria-hidden className="assess-gradient absolute inset-x-0 top-0 h-1" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top_left,rgba(15,168,166,0.15),transparent_60%),radial-gradient(ellipse_at_top_right,rgba(76,184,230,0.13),transparent_55%)]" />

      <header className="relative mx-auto flex max-w-2xl items-center gap-3 px-5 pt-6 sm:pt-10">
        <Image src="/vitality-logo.png" alt="" width={30} height={24} priority />
        <div className="leading-none">
          <div className="text-[15px] font-semibold tracking-[0.28em] text-neutral-900">VITALITY</div>
          <div className="mt-1 text-[10px] font-medium tracking-[0.3em] text-brand">MALTA</div>
        </div>
      </header>

      <main className="relative mx-auto max-w-2xl px-5 pb-20">
        {done ? (
          <div className="assess-rise pt-16 sm:pt-24">
            <div className="assess-gradient flex h-14 w-14 items-center justify-center rounded-full shadow-[0_10px_30px_-10px_rgba(15,168,166,0.7)]">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </div>
            <h1 className="mt-7 text-[40px] font-semibold leading-tight tracking-tight">You&apos;re in!</h1>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-neutral-600">
              Thanks for reaching out. A Vitality coach will message you shortly to chat about your goals and how we can help.
            </p>
          </div>
        ) : (
          <div className="assess-rise pt-12 sm:pt-16">
            <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              Start with <span className="assess-gradient bg-clip-text text-transparent">Vitality</span>
            </h1>
            <p className="mt-3 text-[17px] font-medium leading-snug text-brand-dark">Health made to work around your life, not made to be your life.</p>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-neutral-600">
              Leave your details and a coach will get in touch — no pressure, just a chat about where you are and where you want to be.
            </p>

            <QuestionList questions={SECTION.questions} answers={answers} errors={errors} onChange={setAnswer} />

            <label className="mt-8 flex cursor-pointer items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
              <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setSubmitError(null); }} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]" />
              <span className="text-sm leading-relaxed text-neutral-700">I&apos;m happy for Vitality to contact me by email, phone or WhatsApp about coaching.</span>
            </label>

            <input ref={honeypot} type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />

            {Object.keys(errors).length > 0 && <p className="mt-6 text-sm text-red-600" role="alert">Please answer the highlighted questions.</p>}
            {submitError && <p className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{submitError}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="assess-gradient mt-8 h-14 w-full rounded-2xl px-6 text-[15px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(15,168,166,0.55)] transition hover:brightness-105 active:scale-[0.99] disabled:opacity-70"
            >
              {submitting ? 'Sending…' : 'Get in touch'}
            </button>
          </div>
        )}
      </main>
      <footer className="relative pb-8 text-center text-[11px] tracking-wide text-neutral-400">Vitality Malta</footer>
    </div>
  );
}
