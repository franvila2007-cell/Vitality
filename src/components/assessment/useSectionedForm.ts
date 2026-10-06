'use client';

import { useEffect, useRef, useState } from 'react';
import { validateSection, type Answers, type Section } from '@/lib/assessment/questions';

// The step-by-step engine behind every public multi-section form
// (/assessment, /ironbodyfit-meal-plans): answers, per-section validation, submit, and
// progress that lives in localStorage so an accidental refresh (or closing
// the tab and coming back later) picks up where the person left off —
// cleared after a successful submit. Each form supplies its own look.

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

function loadSaved(storageKey: string, total: number): Saved & { resumed: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as Saved | null;
    if (saved?.submissionId) {
      const answers = saved.answers || {};
      return { answers, step: Math.min(Math.max(saved.step || 0, 0), total), submissionId: saved.submissionId, resumed: Object.keys(answers).length > 0 };
    }
  } catch {}
  return { answers: {}, step: 0, submissionId: newId(), resumed: false };
}

// Must run client-only (the forms are loaded with ssr: false) so saved
// progress can be read straight from localStorage on first render.
export function useSectionedForm({ sections, storageKey, endpoint }: {
  sections: Section[];
  storageKey: string;
  endpoint: string;
}) {
  const total = sections.length;
  const [initial] = useState(() => loadSaved(storageKey, total));
  // step 0 = welcome screen, 1..total = sections
  const [step, setStep] = useState(initial.step);
  const [answers, setAnswers] = useState<Answers>(initial.answers);
  const submissionId = initial.submissionId;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmed, setConfirmedState] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [resumed, setResumed] = useState(initial.resumed);
  const honeypot = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (done) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ answers, step, submissionId } satisfies Saved));
    } catch {
      // storage full / disabled (private mode) — the form still works, it
      // just won't survive a refresh.
    }
  }, [answers, step, submissionId, done, storageKey]);

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

  function setConfirmed(v: boolean) {
    setConfirmedState(v);
    setSubmitError(null);
  }

  function scrollToFirstError(errs: Record<string, string>) {
    const section = sections[step - 1];
    const first = section?.questions.find((q) => errs[q.id]);
    if (!first) return;
    requestAnimationFrame(() => {
      document.getElementById(`q-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function next() {
    if (step > 0) {
      const errs = validateSection(sections[step - 1], answers);
      if (Object.keys(errs).length) {
        setErrors(errs);
        scrollToFirstError(errs);
        return;
      }
    }
    setErrors({});
    setResumed(false);
    setStep((s) => Math.min(s + 1, total));
  }

  function back() {
    setErrors({});
    setSubmitError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    if (submitting) return;
    const errs = validateSection(sections[total - 1], answers);
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
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, answers, confirmed, company: honeypot.current?.value || '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        try { localStorage.removeItem(storageKey); } catch {}
        setDone(true);
        return;
      }
      if (res.status === 422 && data.errors) {
        // Server found something the browser missed (e.g. an earlier
        // section) — take them straight to it.
        setErrors(data.errors);
        setStep((data.section ?? total - 1) + 1);
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

  return {
    total, step, section: step > 0 ? sections[step - 1] : null,
    progress: done ? 100 : Math.round(((step - 1) / total) * 100),
    answers, errors, confirmed, submitting, submitError, done, resumed, honeypot,
    setAnswer, setConfirmed, next, back, submit,
  };
}
