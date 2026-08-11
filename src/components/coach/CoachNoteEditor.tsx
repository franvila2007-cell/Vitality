'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function CoachNoteEditor({ userId, initial }: { userId: string; initial: string }) {
  const supabase = createClient();
  const [note, setNote] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await supabase.from('client_profiles').update({ coach_note: note, updated_by: 'coach' }).eq('user_id', userId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <p className="text-sm font-medium mb-1">Note shown on their Today page</p>
      <p className="text-xs text-neutral-400 mb-3">A short motivational note from you, shown at the bottom of their app.</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand transition-colors resize-none"
      />
      <button onClick={save} disabled={saving} className="mt-3 rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium disabled:opacity-50 transition-transform active:scale-95">
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save note'}
      </button>
    </div>
  );
}
