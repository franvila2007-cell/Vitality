'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewClientPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: '', fullName: '', startWeight: '', goalWeight: '', goalType: 'lose', goalDate: '',
    calories: '2000', proteinG: '150', carbsG: '200', fatG: '65',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/coach/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email, fullName: form.fullName,
        startWeight: parseFloat(form.startWeight) || 0, goalWeight: parseFloat(form.goalWeight) || 0,
        goalType: form.goalType, goalDate: form.goalDate || null,
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
    // A previously-removed client with this email gets restored rather than
    // duplicated (see the API route) — land on their page either way so a
    // restore is immediately visible as "oh, this is their existing data."
    router.push(`/coach/clients/${data.id}`);
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-10 bg-surface border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center">
          <Link href="/coach" className="text-sm text-neutral-400 hover:text-neutral-700">&larr; Clients</Link>
        </div>
      </div>
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-lg font-medium mb-1">Add a client</h1>
        <p className="text-sm text-neutral-400 mb-6">They&rsquo;ll get an email with a link to set their password.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field label="Full name"><input required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className="input" /></Field>
          <Field label="Email"><input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className="input" /></Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start weight (kg)"><input required type="number" step="0.1" value={form.startWeight} onChange={(e) => set('startWeight', e.target.value)} className="input" /></Field>
            <Field label="Goal weight (kg)"><input required type="number" step="0.1" value={form.goalWeight} onChange={(e) => set('goalWeight', e.target.value)} className="input" /></Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Goal type">
              <select value={form.goalType} onChange={(e) => set('goalType', e.target.value)} className="input">
                <option value="lose">Lose weight</option>
                <option value="gain">Gain weight</option>
              </select>
            </Field>
            <Field label="Goal date (optional)"><input type="date" value={form.goalDate} onChange={(e) => set('goalDate', e.target.value)} className="input" /></Field>
          </div>

          <p className="text-xs font-medium text-neutral-500 mt-2">Daily macro targets</p>
          <div className="grid grid-cols-4 gap-2">
            <Field label="Calories"><input type="number" value={form.calories} onChange={(e) => set('calories', e.target.value)} className="input" /></Field>
            <Field label="Protein (g)"><input type="number" value={form.proteinG} onChange={(e) => set('proteinG', e.target.value)} className="input" /></Field>
            <Field label="Carbs (g)"><input type="number" value={form.carbsG} onChange={(e) => set('carbsG', e.target.value)} className="input" /></Field>
            <Field label="Fat (g)"><input type="number" value={form.fatG} onChange={(e) => set('fatG', e.target.value)} className="input" /></Field>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={loading} className="mt-3 rounded-lg bg-brand text-white py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {loading ? 'Creating…' : 'Create client & send invite'}
          </button>
        </form>
      </div>
      <style>{`.input { border: 1px solid var(--border); background: var(--surface); border-radius: 8px; padding: 8px 10px; font-size: 14px; width: 100%; outline: none; } .input:focus { border-color: var(--brand); }`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
