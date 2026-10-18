'use client';

import { useState } from 'react';
import { suggestFoods, applySuggestion } from '@/lib/vitto/suggest';

export type ManualEntry = { name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; estimated: boolean };

type Estimate = { source: 'database' | 'ai'; label: string; cal: number; prot: number; carb: number; fat: number; approx: boolean };

// "Add food manually", the easy way: type what it was and tap "work out the
// numbers" (Vitto's food database first, an AI estimate for anything else), or
// type the numbers off a packet. Calories alone is fine — the macros get
// estimated. Micronutrients are added automatically after saving.
export default function ManualFoodSheet({ foodNames, favourites, onClose, onSave }: {
  foodNames: string[];
  favourites: string[];
  onClose: () => void;
  onSave: (entry: ManualEntry) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [cal, setCal] = useState('');
  const [prot, setProt] = useState('');
  const [carb, setCarb] = useState('');
  const [fat, setFat] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [source, setSource] = useState<Estimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const n = (v: string) => (v.trim() === '' ? NaN : parseFloat(v.replace(',', '.')));
  const kcal = n(cal);
  const suggestions = name.trim().length >= 2 && !source ? suggestFoods(foodNames, name, favourites, 4) : [];

  async function work() {
    if (name.trim().length < 2 || estimating) return;
    setEstimating(true); setError(null);
    try {
      const res = await fetch('/api/vitto/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: name }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't work that out.");
      const est = data as Estimate;
      setCal(String(est.cal)); setProt(String(est.prot)); setCarb(String(est.carb)); setFat(String(est.fat));
      setSource(est);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't work that out — type the numbers in.");
    }
    setEstimating(false);
  }

  async function save() {
    if (saving) return;
    if (!Number.isFinite(kcal) || kcal < 0 || kcal > 6000) { setError('Enter the calories (or tap “Work out the numbers”).'); return; }
    let p = n(prot), c = n(carb), f = n(fat);
    // Calories only: estimate a typical split so the macro bars still move.
    const macrosMissing = ![p, c, f].some(Number.isFinite);
    if (macrosMissing) { p = Math.round((kcal * 0.15) / 4); c = Math.round((kcal * 0.5) / 4); f = Math.round((kcal * 0.35) / 9); }
    setSaving(true); setError(null);
    try {
      await onSave({
        name: name.trim() || 'Manual entry',
        calories: Math.round(kcal), protein_g: Number.isFinite(p) ? p : 0, carbs_g: Number.isFinite(c) ? c : 0, fat_g: Number.isFinite(f) ? f : 0,
        estimated: macrosMissing || !!source?.approx,
      });
    } catch {
      setError("Couldn't save that — check your connection and try again.");
      setSaving(false);
    }
  }

  const field = 'rounded-xl border border-border bg-neutral-50 px-3 py-2.5 text-base outline-none focus:border-brand focus:bg-white transition-colors w-full';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-surface rounded-3xl p-5 w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className="text-base font-semibold">Add food manually</p>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 -mt-1 rounded-full text-neutral-400 hover:bg-neutral-100 text-lg">✕</button>
        </div>
        <p className="text-xs text-neutral-400 mb-4">Vitto adds the micronutrients for you after.</p>

        <label className="block text-xs font-medium text-neutral-500 mb-1.5">What was it?</label>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setSource(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') work(); }}
          placeholder="e.g. 2 slices of banana bread, chicken wrap…"
          autoFocus
          maxLength={120}
          className={field}
        />
        {suggestions.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto mt-2 -mx-1 px-1">
            {suggestions.map((sg) => (
              <button key={sg.label} onClick={() => setName((v) => applySuggestion(v, sg).trim())} className="flex-shrink-0 rounded-full border border-brand/30 bg-brand-light text-brand-dark text-xs font-medium px-3 py-1.5 active:scale-95">{sg.label}</button>
            ))}
          </div>
        )}
        {name.trim().length < 2 && favourites.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto mt-2 -mx-1 px-1">
            {favourites.slice(0, 6).map((f) => (
              <button key={f} onClick={() => setName(f)} className="flex-shrink-0 rounded-full border border-border bg-neutral-50 text-neutral-600 text-xs font-medium px-3 py-1.5 active:scale-95">{f}</button>
            ))}
          </div>
        )}

        <button
          onClick={work}
          disabled={name.trim().length < 2 || estimating}
          className="mt-3 w-full rounded-xl border border-brand/40 bg-brand-light text-brand-dark py-2.5 text-sm font-semibold disabled:opacity-40 active:scale-[0.99] transition-transform"
        >
          {estimating ? 'Working it out…' : '✨ Work out the numbers for me'}
        </button>
        {source && (
          <p className="mt-2 text-2xs text-neutral-500">
            {source.source === 'database' ? 'From Vitto’s food database' : 'Vitto’s estimate'}{source.approx ? ' — close, not exact. Change anything you know better.' : ' — change anything you like.'}
          </p>
        )}

        <div className="grid grid-cols-4 gap-2 mt-4">
          {([['Kcal', cal, setCal], ['Protein', prot, setProt], ['Carbs', carb, setCarb], ['Fat', fat, setFat]] as const).map(([label, value, set]) => (
            <label key={label} className="flex flex-col gap-1">
              <span className="text-3xs uppercase text-neutral-400">{label}{label !== 'Kcal' && ' g'}</span>
              <input inputMode="decimal" value={value} onChange={(e) => { set(e.target.value); setError(null); }} className={`${field} px-2.5 text-center`} />
            </label>
          ))}
        </div>
        <p className="text-2xs text-neutral-400 mt-2">Only know the calories? That&rsquo;s fine — Vitto estimates the protein, carbs and fat.</p>

        {error && <p className="text-sm text-status-bad-text mt-3" role="alert">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border text-neutral-600 py-3 text-sm font-medium">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-[1.4] rounded-xl bg-brand text-white py-3 text-sm font-semibold disabled:opacity-50 active:scale-[0.99] transition-transform">
            {saving ? 'Adding…' : 'Add to my log'}
          </button>
        </div>
      </div>
    </div>
  );
}
