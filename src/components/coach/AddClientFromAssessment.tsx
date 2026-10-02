'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ClientSetup } from '@/lib/assessment/clientSetup';

const input = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand transition-colors w-full';

// "Add as client" on a submitted assessment: everything the add-client form
// needs is pre-filled from the client's answers (targets are an estimate),
// so creating the account + sending the invite email is one confirm click.
export default function AddClientFromAssessment({ initial }: { initial: ClientSetup }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])) as Record<keyof ClientSetup, string>);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  function set(key: keyof ClientSetup, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function create() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const res = await fetch('/api/coach/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email.trim(), fullName: form.fullName.trim(),
        startWeight: parseFloat(form.startWeight) || 0, goalWeight: parseFloat(form.goalWeight) || 0,
        goalType: form.goalType, goalDate: null,
        calories: parseInt(form.calories) || 2000, proteinG: parseInt(form.proteinG) || 150,
        carbsG: parseInt(form.carbsG) || 200, fatG: parseInt(form.fatG) || 65,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || 'Something went wrong.');
      return;
    }
    setCreatedId(data.id);
    router.refresh();
  }

  if (createdId) {
    return (
      <div className="rounded-xl bg-status-good-bg text-status-good-text px-4 py-3 text-sm flex items-center justify-between gap-3">
        <span>Client created — invite email sent to {form.email}.</span>
        <Link href={`/coach/clients/${createdId}`} className="font-medium underline shrink-0">Open client</Link>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium hover:opacity-90">
        + Add as client &amp; send invite
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-brand/30 bg-brand-light/40 p-4 flex flex-col gap-3">
      <p className="text-sm font-medium">Check the details, then create their account</p>
      <div className="grid grid-cols-2 gap-2">
        <L label="Full name"><input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className={input} /></L>
        <L label="Email"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={input} /></L>
        <L label="Start weight (kg)"><input type="number" step="0.1" value={form.startWeight} onChange={(e) => set('startWeight', e.target.value)} className={input} /></L>
        <L label="Goal weight (kg)"><input type="number" step="0.1" value={form.goalWeight} onChange={(e) => set('goalWeight', e.target.value)} className={input} /></L>
        <L label="Goal">
          <select value={form.goalType} onChange={(e) => set('goalType', e.target.value)} className={input}>
            <option value="lose">Lose</option>
            <option value="gain">Gain</option>
          </select>
        </L>
        <L label="Calories"><input type="number" value={form.calories} onChange={(e) => set('calories', e.target.value)} className={input} /></L>
        <L label="Protein (g)"><input type="number" value={form.proteinG} onChange={(e) => set('proteinG', e.target.value)} className={input} /></L>
        <L label="Carbs (g)"><input type="number" value={form.carbsG} onChange={(e) => set('carbsG', e.target.value)} className={input} /></L>
        <L label="Fat (g)"><input type="number" value={form.fatG} onChange={(e) => set('fatG', e.target.value)} className={input} /></L>
      </div>
      <p className="text-2xs text-neutral-500">Targets are a starting estimate from their answers — you can change them any time on their client page.</p>
      {error && <p className="text-sm text-status-bad-text">{error}</p>}
      <div className="flex gap-2">
        <button onClick={create} disabled={loading} className="flex-1 rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60">
          {loading ? 'Creating…' : 'Create client & send invite'}
        </button>
        <button onClick={() => setOpen(false)} disabled={loading} className="rounded-lg px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100">Cancel</button>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-2xs text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
