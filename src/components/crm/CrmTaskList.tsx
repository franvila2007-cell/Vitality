'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addDays, localDateStr } from '@/lib/date';
import { dueLabel } from '@/lib/crm/format';

export type CrmTaskItem = { id: string; title: string; due_on: string; done_at: string | null; contact_id: string; contactName?: string };

const TONE = {
  overdue: 'text-status-bad-text',
  today: 'text-status-warn-text font-medium',
  soon: 'text-neutral-400',
};

// Follow-ups: tick off, and (with contactId) add new ones. Used on the CRM
// overview (all open follow-ups, linked to each contact) and on a contact.
export default function CrmTaskList({ tasks, contactId, emptyText }: { tasks: CrmTaskItem[]; contactId?: string; emptyText: string }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [today] = useState(() => localDateStr());
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(() => addDays(localDateStr(), 1));
  const [busy, setBusy] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  async function toggle(t: CrmTaskItem) {
    const nowDone = !(doneIds.has(t.id) || t.done_at);
    setDoneIds((s) => { const n = new Set(s); if (nowDone) n.add(t.id); else n.delete(t.id); return n; });
    await supabase.from('crm_tasks').update({ done_at: nowDone ? new Date().toISOString() : null }).eq('id', t.id);
    if (nowDone) await supabase.from('crm_activities').insert({ contact_id: t.contact_id, kind: 'system', body: `Follow-up done: ${t.title}` });
    router.refresh();
  }

  async function add() {
    if (!contactId || !title.trim() || busy) return;
    setBusy(true);
    const { error } = await supabase.from('crm_tasks').insert({ contact_id: contactId, title: title.trim().slice(0, 200), due_on: due });
    setBusy(false);
    if (!error) { setTitle(''); router.refresh(); }
  }

  const quick = [['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]] as const;

  return (
    <div>
      {tasks.length === 0 && <p className="text-sm text-neutral-400 mb-2">{emptyText}</p>}
      <div className="flex flex-col gap-1.5">
        {tasks.map((t) => {
          const done = doneIds.has(t.id) || !!t.done_at;
          const label = dueLabel(t.due_on, today);
          return (
            <div key={t.id} className="flex items-center gap-3 rounded-lg bg-neutral-50 px-3 py-2">
              <button
                onClick={() => toggle(t)}
                aria-label={done ? 'Mark not done' : 'Mark done'}
                className={`w-5 h-5 rounded-md flex items-center justify-center text-xs flex-shrink-0 ${done ? 'bg-brand text-white' : 'border border-neutral-300 bg-white'}`}
              >{done ? '✓' : ''}</button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm truncate ${done ? 'line-through text-neutral-400' : ''}`}>{t.title}</p>
                {t.contactName && (
                  <Link href={`/coach/crm/contacts/${t.contact_id}`} className="text-2xs text-brand-dark hover:underline">{t.contactName}</Link>
                )}
              </div>
              {!done && <span className={`text-2xs flex-shrink-0 ${TONE[label.tone]}`}>{label.text}</span>}
            </div>
          );
        })}
      </div>

      {contactId && (
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder="Add a follow-up… e.g. Send consultation link"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {quick.map(([text, n]) => {
              const d = addDays(today, n);
              return (
                <button key={text} onClick={() => setDue(d)} className={`rounded-full border px-2.5 py-1 text-2xs font-medium ${due === d ? 'border-brand bg-brand-light text-brand-dark' : 'border-border text-neutral-500'}`}>{text}</button>
              );
            })}
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-full border border-border px-2.5 py-0.5 text-2xs text-neutral-600 outline-none" />
            <button onClick={add} disabled={!title.trim() || busy} className="ml-auto rounded-lg bg-brand text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40">Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
