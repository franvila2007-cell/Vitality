'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { CrmStage } from '@/lib/supabase/database.types';
import { STAGES, STAGE_META } from '@/lib/crm/constants';

// Moves a contact through the pipeline. The stage-change entry on the
// timeline is written by a database trigger (0012_crm.sql).
export default function CrmStagePicker({ id, initial, compact }: { id: string; initial: CrmStage; compact?: boolean }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [stage, setStage] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function choose(next: CrmStage) {
    if (next === stage) return;
    const prev = stage;
    setStage(next);
    setSaving(true);
    const { error } = await supabase.from('crm_contacts').update({ stage: next }).eq('id', id);
    setSaving(false);
    if (error) setStage(prev);
    else router.refresh();
  }

  if (compact) {
    // A badge with an invisible native <select> laid over it: tapping opens
    // the phone's own picker, and the badge keeps its small size (the app
    // forces form controls to 16px on phones to stop iOS zoom).
    return (
      <span className={`relative inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide ${STAGE_META[stage].className} ${saving ? 'opacity-60' : ''}`}>
        {STAGE_META[stage].short}
        <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        <select
          value={stage}
          disabled={saving}
          onChange={(e) => choose(e.target.value as CrmStage)}
          aria-label="Move to stage"
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        >
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {STAGES.map((s) => (
        <button
          key={s.key}
          onClick={() => choose(s.key)}
          disabled={saving}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
            stage === s.key ? s.className : 'border-border text-neutral-400 hover:text-neutral-700'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
