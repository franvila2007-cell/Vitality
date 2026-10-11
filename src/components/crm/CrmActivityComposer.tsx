'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { CrmActivityKind } from '@/lib/supabase/database.types';
import { ACTIVITY_META, LOGGABLE_KINDS } from '@/lib/crm/constants';

// Log a note / call / message / meeting / email on a contact's timeline.
export default function CrmActivityComposer({ contactId }: { contactId: string }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [kind, setKind] = useState<CrmActivityKind>('note');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('crm_activities').insert({ contact_id: contactId, kind, body: body.trim().slice(0, 4000) });
    setBusy(false);
    if (error) { setError("Couldn't save that. Try again."); return; }
    setBody('');
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border focus-within:border-brand transition-colors">
      <div className="flex gap-1 px-2 pt-2 overflow-x-auto">
        {LOGGABLE_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`flex-shrink-0 rounded-full px-2.5 py-1 text-2xs font-medium ${kind === k ? 'bg-brand-light text-brand-dark' : 'text-neutral-500 hover:bg-neutral-100'}`}
          >
            {ACTIVITY_META[k].emoji} {ACTIVITY_META[k].label}
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder={kind === 'call' ? 'How did the call go?' : kind === 'message' ? 'What did you send / what did they say?' : 'Write a note…'}
        className="block w-full resize-y bg-transparent px-3 py-2 text-sm outline-none"
      />
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="text-2xs text-red-600">{error}</span>
        <button onClick={save} disabled={!body.trim() || busy} className="rounded-lg bg-brand text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40">
          {busy ? 'Saving…' : 'Log'}
        </button>
      </div>
    </div>
  );
}
