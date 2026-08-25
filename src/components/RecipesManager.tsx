'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import FoodGuide from '@/components/FoodGuide';
import type { Database } from '@/lib/supabase/database.types';

type Recipe = Database['public']['Tables']['custom_foods']['Row'];

const EMPTY_FORM = { name: '', ingredientsText: '', calories: '', proteinG: '', carbsG: '', fatG: '' };

export default function RecipesManager() {
  // Memoized once — see TodayClient.tsx for why an unstable client instance
  // here would retrigger load()'s effect on every render.
  const [supabase] = useState(() => createClient());
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [calculating, setCalculating] = useState(false);
  const [calcNote, setCalcNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('custom_foods').select('*').eq('user_id', user.id).order('name');
    setRecipes(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function calculateFromIngredients() {
    if (!form.ingredientsText.trim()) return;
    setCalculating(true);
    setCalcNote(null);
    try {
      const res = await fetch('/api/recipes/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredientsText: form.ingredientsText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not calculate');
      setForm((f) => ({ ...f, calories: String(data.totals.cal), proteinG: String(data.totals.prot), carbsG: String(data.totals.carb), fatG: String(data.totals.fat) }));
      setCalcNote(
        data.unmatched.length > 0
          ? `Matched ${data.items.length} ingredient${data.items.length === 1 ? '' : 's'} — couldn't figure out: ${data.unmatched.join(', ')}. Adjust the totals below if needed.`
          : `Matched all ${data.items.length} ingredient${data.items.length === 1 ? '' : 's'}. Totals filled in below — adjust if needed.`
      );
    } catch (err) {
      setCalcNote(err instanceof Error ? err.message : 'Could not calculate — enter totals manually.');
    }
    setCalculating(false);
  }

  async function saveRecipe(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Strip a leading count like "1 " or "2x " — the saved macros already
    // represent one whole serving, so a leading number in the name itself
    // is redundant, and worse, it means the recipe can only ever match if
    // someone types that exact digit again ("1 Walnut Half" never matches
    // "walnut half" or "2 walnut halves" as typed) — confirmed as a real
    // cause of "Vitto doesn't recognize it" for a real client's recipes.
    const name = form.name.trim().replace(/^\d+\s*x?\s+/i, '');
    if (!name) { setError('Give the recipe a name.'); return; }
    const calories = parseFloat(form.calories), proteinG = parseFloat(form.proteinG), carbsG = parseFloat(form.carbsG), fatG = parseFloat(form.fatG);
    if ([calories, proteinG, carbsG, fatG].some((v) => Number.isNaN(v))) { setError('Fill in all four macro totals (or calculate them from ingredients).'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error: upsertErr } = await supabase.from('custom_foods').upsert(
      { user_id: user.id, name, calories, protein_g: proteinG, carbs_g: carbsG, fat_g: fatG, ingredients_text: form.ingredientsText.trim() || null },
      { onConflict: 'user_id,name' }
    );
    setSaving(false);
    if (upsertErr) { setError(upsertErr.message); return; }
    setForm(EMPTY_FORM);
    setCalcNote(null);
    load();
  }

  async function deleteRecipe(id: string) {
    setRecipes((r) => r.filter((x) => x.id !== id));
    await supabase.from('custom_foods').delete().eq('id', id);
  }

  if (loading) return <p className="text-sm text-neutral-400">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-medium mb-1">Teach Vitto a recipe</p>
        <p className="text-xs text-neutral-400 mb-3">Save a meal once, then just say its name in chat and Vitto logs it with these macros — no re-explaining every time.</p>
        <form onSubmit={saveRecipe} className="flex flex-col gap-2.5">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Recipe name (e.g. Sunday chicken stir fry)"
            className="rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-brand transition-colors"
          />
          <textarea
            value={form.ingredientsText}
            onChange={(e) => setForm((f) => ({ ...f, ingredientsText: e.target.value }))}
            placeholder={'Ingredients, one per line (optional)\ne.g. 200g chicken breast\n1 cup rice\n1 tbsp olive oil'}
            rows={3}
            className="rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-brand transition-colors resize-none"
          />
          <button
            type="button"
            onClick={calculateFromIngredients}
            disabled={calculating || !form.ingredientsText.trim()}
            className="self-start text-xs text-brand-dark font-medium hover:opacity-70 disabled:opacity-40 transition-opacity"
          >
            {calculating ? 'Calculating…' : 'Calculate totals from ingredients'}
          </button>
          {calcNote && <p className="text-[11px] text-neutral-400">{calcNote}</p>}

          <div className="grid grid-cols-4 gap-2">
            <Field label="Kcal" value={form.calories} onChange={(v) => setForm((f) => ({ ...f, calories: v }))} />
            <Field label="Protein" value={form.proteinG} onChange={(v) => setForm((f) => ({ ...f, proteinG: v }))} />
            <Field label="Carbs" value={form.carbsG} onChange={(v) => setForm((f) => ({ ...f, carbsG: v }))} />
            <Field label="Fat" value={form.fatG} onChange={(v) => setForm((f) => ({ ...f, fatG: v }))} />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={saving} className="mt-1 rounded-lg bg-brand text-white py-2 text-sm font-medium disabled:opacity-50 transition-transform active:scale-[0.98]">
            {saving ? 'Saving…' : 'Save recipe'}
          </button>
        </form>
      </div>

      <FoodGuide />

      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-medium mb-3">Your recipes · {recipes.length}</p>
        {recipes.length === 0 && <p className="text-sm text-neutral-400">No recipes saved yet.</p>}
        <div className="flex flex-col gap-1.5">
          {recipes.map((r) => (
            <div key={r.id} className="bg-neutral-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{r.name}</span>
                <span className="flex-shrink-0 text-[11px] text-neutral-400 whitespace-nowrap">{Math.round(r.calories)} kcal · {Math.round(r.protein_g)}p {Math.round(r.carbs_g)}c {Math.round(r.fat_g)}f</span>
                <button onClick={() => deleteRecipe(r.id)} className="flex-shrink-0 text-neutral-300 hover:text-red-500 text-sm transition-colors">✕</button>
              </div>
              {r.ingredients_text && <p className="text-[11px] text-neutral-400 mt-1 whitespace-pre-line">{r.ingredients_text}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase text-neutral-400">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-neutral-50 px-2 py-1.5 text-sm outline-none focus:border-brand transition-colors"
      />
    </label>
  );
}
