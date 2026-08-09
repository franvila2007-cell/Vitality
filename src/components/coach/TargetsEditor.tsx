'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

type Targets = Database['public']['Tables']['targets']['Row'];

export default function TargetsEditor({ userId, initial }: { userId: string; initial: Targets | null }) {
  const supabase = createClient();
  const [form, setForm] = useState({
    calories: initial?.calories ?? 2000,
    protein_g: initial?.protein_g ?? 150,
    carbs_g: initial?.carbs_g ?? 200,
    fat_g: initial?.fat_g ?? 65,
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await supabase.from('targets').upsert({ user_id: userId, ...form, updated_by: 'coach' });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">Daily macro targets</p>
        {initial && <p className="text-[11px] text-neutral-400">last set by {initial.updated_by}</p>}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(['calories', 'protein_g', 'carbs_g', 'fat_g'] as const).map((key) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-[10px] uppercase text-neutral-400">{key === 'calories' ? 'Kcal' : key.replace('_g', '')}</span>
            <input
              type="number"
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: parseInt(e.target.value) || 0 }))}
              className="rounded-lg border border-border px-2 py-1.5 text-sm"
            />
          </label>
        ))}
      </div>
      <button onClick={save} disabled={saving} className="mt-3 rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save targets'}
      </button>
    </div>
  );
}
