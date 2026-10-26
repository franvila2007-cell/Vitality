'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { isVisible, validateSection, type Answers } from '@/lib/assessment/questions';
import { checkinSections, CHECKIN_GOALS, PHOTO_BUCKET, PHOTO_SLOTS, type CheckinGoal, type PhotoSlot } from '@/lib/challenge/checkin';
import { createClient } from '@/lib/supabase/client';
import type { Progress } from '@/lib/challenge/progress';
import { Card, Field, PrimaryButton, groupHalves, inputBase } from './ui';

// 8-Week Challenge weekly check-in (/challenge/check-in): one shared link.
// Email first (remembered on this device) → the server recognises the member
// (intake, saved goal, or phone) → their goal's questions → photos → send.
// Same look as the intake. Rendered client-only (see CheckinLoader).

const EMAIL_KEY = 'vitality-challenge-checkin-email';
const DRAFT_KEY = 'vitality-challenge-checkin-draft';

type Phase = 'email' | 'phone' | 'goal' | 'form' | 'done';
type Draft = { email: string; week: number; answers: Answers; step: number; submissionId: string };

function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function read<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null') as T | null; } catch { return null; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function remove(key: string) {
  try { localStorage.removeItem(key); } catch {}
}

// Phone photos are big: shrink to 1600px JPEG before upload. Anything the
// browser can't decode (e.g. HEIC outside Safari) goes up as it is.
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export default function CheckinForm() {
  const [phase, setPhase] = useState<Phase>('email');
  const [email, setEmail] = useState(() => read<string>(EMAIL_KEY) ?? '');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [needName, setNeedName] = useState(false);
  const [goalChoice, setGoalChoice] = useState<CheckinGoal | ''>('');
  const [startWeight, setStartWeight] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const [goal, setGoal] = useState<CheckinGoal | null>(null);
  const [week, setWeek] = useState(1);
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0);
  const [submissionId, setSubmissionId] = useState(newId);
  const [photos, setPhotos] = useState<Partial<Record<PhotoSlot, File>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Progress | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  const sections = goal ? checkinSections(goal) : [];
  const total = sections.length + 1; // + photos
  const section = step < sections.length ? sections[step] : null;

  // Keep a draft so closing the tab mid-check-in loses nothing.
  useEffect(() => {
    if (phase === 'form') write(DRAFT_KEY, { email, week, answers, step, submissionId } satisfies Draft);
  }, [phase, email, week, answers, step, submissionId]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [phase, step]);

  async function lookup(withPhone: boolean) {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { setMessage('Please enter a valid email address.'); return; }
    if (withPhone && phone.replace(/\D/g, '').length < 8) { setMessage('Please enter your WhatsApp number.'); return; }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/challenge/check-in/lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e, phone: withPhone ? phone : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(data.error || 'Something went wrong. Please try again.'); return; }
      write(EMAIL_KEY, e);
      setFirst(data.firstName ?? null);
      setWeek(data.week ?? 1);
      if (data.status === 'ok') start(data.goal, data.week);
      else if (data.status === 'need_phone') setPhase('phone');
      else { setNeedName(!!data.needName); setPhase('goal'); }
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function start(g: CheckinGoal, wk: number) {
    setGoal(g);
    const draft = read<Draft>(DRAFT_KEY);
    if (draft && draft.email === email.trim().toLowerCase() && draft.submissionId) {
      setAnswers(draft.answers ?? {});
      setStep(Math.min(draft.step ?? 0, checkinSections(g).length));
      setWeek(draft.week ?? wk);
      setSubmissionId(draft.submissionId);
    }
    setPhase('form');
  }

  function confirmGoal() {
    if (!goalChoice) { setMessage('Please choose your main goal.'); return; }
    if (needName && fullName.trim().length < 2) { setMessage('Please tell us your name.'); return; }
    if (needName) setFirst(fullName.trim().split(/\s+/)[0]);
    setMessage(null);
    start(goalChoice, week);
  }

  function setAnswer(id: string, v: string | string[]) {
    setAnswers((a) => ({ ...a, [id]: v }));
    if (errors[id]) setErrors((e) => { const r = { ...e }; delete r[id]; return r; });
  }

  function next() {
    if (section) {
      const errs = validateSection(section, answers);
      if (Object.keys(errs).length) {
        setErrors(errs);
        const q = section.questions.find((x) => errs[x.id]);
        if (q) requestAnimationFrame(() => document.getElementById(`q-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        return;
      }
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, total - 1));
  }

  function back() {
    setErrors({});
    setMessage(null);
    if (step === 0) { setPhase('email'); return; }
    setStep((s) => s - 1);
  }

  async function submit() {
    if (busy || !goal) return;
    setBusy(true);
    setMessage(null);
    try {
      // 1. Photos straight into the private bucket via one-off signed links.
      const chosen = PHOTO_SLOTS.filter((s) => photos[s]);
      const photoPaths: string[] = [];
      if (chosen.length) {
        const blobs = await Promise.all(chosen.map((s) => shrink(photos[s]!)));
        const res = await fetch('/api/challenge/check-in/photos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionId, files: chosen.map((slot, i) => ({ slot, type: blobs[i].type || 'image/jpeg' })) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setMessage(data.error || "We couldn't upload your photos. Please try again."); return; }
        const storage = createClient().storage.from(PHOTO_BUCKET);
        for (const [i, u] of (data.uploads as { path: string; token: string }[]).entries()) {
          const { error } = await storage.uploadToSignedUrl(u.path, u.token, blobs[i], { contentType: blobs[i].type || 'image/jpeg' });
          if (error) { setMessage("A photo didn't upload. Check your connection and try again."); return; }
          photoPaths.push(u.path);
        }
      }
      // 2. The check-in itself.
      const res = await fetch('/api/challenge/check-in', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId, email: email.trim().toLowerCase(), phone, goal, week, answers, photoPaths,
          fullName: fullName.trim(), startWeight, company: honeypot.current?.value || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { remove(DRAFT_KEY); setResult(data.progress ?? null); setPhase('done'); return; }
      if (res.status === 422 && data.errors) { setErrors(data.errors); setStep(data.section ?? 0); return; }
      setMessage(data.error || 'Something went wrong. Please try again.');
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again, your answers are saved.");
    } finally {
      setBusy(false);
    }
  }

  const progress = Math.round(((step + 1) / total) * 100);
  const errorBox = message && <p className="mt-6 rounded-xl bg-[#FDECEA] px-4 py-3 text-[15px] text-[#A3321F]" role="alert">{message}</p>;

  return (
    <div className="min-h-dvh w-full bg-[#D6F5EE] text-[#333F6E]">
      <header className="flex justify-center px-4 pt-6 pb-2">
        <Image src="/vitality-logo.png" alt="Vitality" width={44} height={35} priority />
      </header>

      {phase === 'form' && (
        <div className="sticky top-0 z-20 bg-[#D6F5EE]/95 backdrop-blur-sm">
          <div className="mx-auto max-w-xl px-4 py-3">
            <div className="mb-2 flex items-baseline justify-between text-[13px]">
              <span className="font-semibold">{section?.title ?? 'Progress photos'}</span>
              <span className="tabular-nums text-[#333F6E]/60">Step {step + 1} of {total}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-[#26A88A] transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-xl px-4 pb-16 pt-4">
        {phase === 'email' && (
          <Card key="email">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#26A88A]">8-Week Challenge</p>
            <h1 className="mt-3 text-[32px] font-bold leading-[1.1] tracking-tight">Weekly check-in</h1>
            <p className="mt-3 text-[17px] leading-relaxed text-[#333F6E]/80">Takes about 3 minutes. Start with the email you joined with.</p>
            <label htmlFor="ci-email" className="mt-7 block text-[16px] font-semibold">Email</label>
            <input
              id="ci-email" type="email" autoComplete="email" autoCapitalize="none" value={email}
              onChange={(e) => { setEmail(e.target.value); setMessage(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') lookup(false); }}
              className={`${inputBase} mt-2.5 h-14 border-[#333F6E]/15`}
            />
            {errorBox}
            <PrimaryButton onClick={() => lookup(false)} disabled={busy} className="mt-8">{busy ? 'Checking…' : 'Continue'}</PrimaryButton>
          </Card>
        )}

        {phase === 'phone' && (
          <Card key="phone">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight">We couldn&apos;t find that email</h1>
            <p className="mt-3 text-[16px] leading-relaxed text-[#333F6E]/80">No problem. What&apos;s your WhatsApp number? We&apos;ll find you that way.</p>
            <label htmlFor="ci-phone" className="mt-7 block text-[16px] font-semibold">WhatsApp number</label>
            <input
              id="ci-phone" type="tel" autoComplete="tel" placeholder="+356 7900 0000" value={phone}
              onChange={(e) => { setPhone(e.target.value); setMessage(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') lookup(true); }}
              className={`${inputBase} mt-2.5 h-14 border-[#333F6E]/15`}
            />
            {errorBox}
            <div className="mt-8 flex gap-3">
              <BackButton onClick={() => { setMessage(null); setPhase('email'); }} />
              <PrimaryButton onClick={() => lookup(true)} disabled={busy} className="flex-1">{busy ? 'Checking…' : 'Continue'}</PrimaryButton>
            </div>
          </Card>
        )}

        {phase === 'goal' && (
          <Card key="goal">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight">{first ? `Hey ${first} 👋` : 'Hey 👋'}</h1>
            <p className="mt-3 text-[16px] leading-relaxed text-[#333F6E]/80">Just this once, so we can tailor your check-ins.</p>
            <div className="mt-7 flex flex-col gap-7">
              {needName && (
                <div>
                  <label htmlFor="ci-name" className="block text-[16px] font-semibold">Your name</label>
                  <input id="ci-name" type="text" autoComplete="name" value={fullName} onChange={(e) => { setFullName(e.target.value); setMessage(null); }} className={`${inputBase} mt-2.5 h-14 border-[#333F6E]/15`} />
                </div>
              )}
              <Field
                q={{ id: 'goal', type: 'choice', label: "What's your main goal for the 8 weeks?", required: true, options: [...CHECKIN_GOALS] }}
                answers={{ goal: goalChoice }} onChange={(_, v) => { setGoalChoice(v as CheckinGoal); setMessage(null); }}
              />
              <Field
                q={{ id: 'start_weight', type: 'number', label: 'Your starting weight, if you know it', unit: 'kg', step: 0.1 }}
                answers={{ start_weight: startWeight }} onChange={(_, v) => setStartWeight(v as string)}
              />
            </div>
            {errorBox}
            <div className="mt-8 flex gap-3">
              <BackButton onClick={() => { setMessage(null); setPhase('email'); }} />
              <PrimaryButton onClick={confirmGoal} className="flex-1">Continue</PrimaryButton>
            </div>
          </Card>
        )}

        {phase === 'form' && (
          <Card key={`step-${step}`}>
            {step === 0 && (
              <div className="mb-6 border-b border-[#333F6E]/10 pb-6">
                <p className="text-[24px] font-bold leading-tight tracking-tight">{first ? `Hey ${first} 👋` : 'Hey 👋'}</p>
                <div className="mt-2 flex items-center gap-2 text-[17px] font-semibold text-[#26A88A]">
                  <label htmlFor="ci-week">Week</label>
                  <select
                    id="ci-week" value={week} onChange={(e) => setWeek(Number(e.target.value))}
                    className="h-10 rounded-xl border border-[#333F6E]/15 bg-white px-2 text-[16px] font-semibold text-[#333F6E] outline-none focus:border-[#26A88A]"
                  >
                    {Array.from({ length: 8 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                  </select>
                  <span>check-in</span>
                </div>
              </div>
            )}

            {section ? (
              <>
                <h2 className="text-[26px] font-bold leading-tight tracking-tight">{section.title}</h2>
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
              </>
            ) : (
              <>
                <h2 className="text-[26px] font-bold leading-tight tracking-tight">Progress photos</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-[#333F6E]/75">
                  Required in week 1 and week 8 to be eligible for prizes. Only the Vitality coaches can see them.
                </p>
                <div className="mt-6 grid grid-cols-3 gap-2.5">
                  {PHOTO_SLOTS.map((slot) => (
                    <PhotoTile key={slot} slot={slot} file={photos[slot]} onChange={(f) => setPhotos((p) => ({ ...p, [slot]: f }))} />
                  ))}
                </div>
              </>
            )}

            <input ref={honeypot} type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />
            {Object.keys(errors).length > 0 && <p className="mt-6 text-[15px] text-[#C2412D]" role="alert">Please check the highlighted answers.</p>}
            {errorBox}

            <div className="mt-8 flex gap-3">
              <BackButton onClick={back} />
              <PrimaryButton onClick={section ? next : submit} disabled={busy} className="flex-1">
                {section ? 'Continue' : busy ? 'Sending…' : 'Send my check-in'}
              </PrimaryButton>
            </div>
          </Card>
        )}

        {phase === 'done' && (
          <Card key="done">
            <h1 className="text-[30px] font-bold leading-[1.15] tracking-tight">Check-in received ✅</h1>
            <p className="mt-4 text-[17px] leading-relaxed text-[#333F6E]/80">Great work this week. Your coach will reply within 24 hours.</p>
            {result && (
              <div className="mt-7 rounded-2xl bg-[#D6F5EE] p-5">
                <ul className="flex flex-col gap-2.5">
                  {result.lines.map((line) => (
                    <li key={line} className="text-[16px] font-semibold leading-snug">{line}</li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-1.5" aria-hidden>
                  {Array.from({ length: 8 }, (_, i) => (
                    <span key={i} className={`h-2 flex-1 rounded-full ${i < result.weeksDone ? 'bg-[#26A88A]' : 'bg-white'}`} />
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-14 shrink-0 rounded-2xl border border-[#333F6E]/15 bg-white px-5 text-[16px] font-semibold text-[#333F6E] transition active:scale-[0.98]">
      Back
    </button>
  );
}

function PhotoTile({ slot, file, onChange }: { slot: PhotoSlot; file?: File; onChange: (f: File | undefined) => void }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const label = slot[0].toUpperCase() + slot.slice(1);
  return (
    <div>
      <label className={`relative flex aspect-[3/4] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border transition active:scale-[0.98] ${file ? 'border-[#26A88A]' : 'border-dashed border-[#333F6E]/25 bg-[#D6F5EE]/40'}`}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${label} photo`} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#26A88A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            <span className="mt-1.5 text-[14px] font-semibold">{label}</span>
          </>
        )}
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? undefined)} />
      </label>
      {file && (
        <button type="button" onClick={() => onChange(undefined)} className="mt-1.5 w-full text-center text-[13px] text-[#333F6E]/60">
          {label} · Remove
        </button>
      )}
    </div>
  );
}
