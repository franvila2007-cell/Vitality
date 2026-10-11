'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { CrmContactRow, CrmStage } from '@/lib/supabase/database.types';
import { SOURCES, STAGES } from '@/lib/crm/constants';

const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand transition-colors';

type Fields = { full_name: string; email: string; phone: string; source: string; stage: CrmStage; value_eur: string; tags: string; lost_reason: string; notes: string };

function toFields(c?: Partial<CrmContactRow>): Fields {
  return {
    full_name: c?.full_name ?? '', email: c?.email ?? '', phone: c?.phone ?? '',
    source: c?.source ?? 'instagram', stage: c?.stage ?? 'lead',
    value_eur: c?.value_eur != null ? String(c.value_eur) : '', tags: (c?.tags ?? []).join(', '),
    lost_reason: c?.lost_reason ?? '', notes: c?.notes ?? '',
  };
}

// Add a contact by hand (no `contact`) or edit an existing one's details.
// Stage is only picked here when adding — on a contact page it has its own
// picker so moves get logged on the timeline.
export default function CrmContactForm({ contact, onDone }: { contact?: CrmContactRow; onDone?: () => void }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [f, setF] = useState<Fields>(() => toFields(contact));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);
  const set = (k: keyof Fields, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!f.full_name.trim()) { setError('Add a name.'); return; }
    const email = f.email.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setError('That email doesn’t look right.'); return; }
    const value = f.value_eur.trim() ? Number(f.value_eur) : null;
    if (value != null && !Number.isFinite(value)) { setError('Value should be a number.'); return; }
    setBusy(true);
    setError(null);
    const row = {
      full_name: f.full_name.trim().slice(0, 120),
      email: email || null,
      phone: f.phone.trim() || null,
      source: f.source,
      value_eur: value,
      tags: f.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20),
      lost_reason: f.lost_reason.trim() || null,
      notes: f.notes.slice(0, 4000),
    };
    const res = contact
      ? await supabase.from('crm_contacts').update(row).eq('id', contact.id).select('id').single()
      : await supabase.from('crm_contacts').insert({ ...row, stage: f.stage }).select('id').single();
    setBusy(false);
    if (res.error) {
      if (res.error.code === '23505') {
        const { data: dupe } = await supabase.from('crm_contacts').select('id, full_name').eq('email', email).maybeSingle();
        setError(dupe ? <>That email already belongs to <Link className="underline" href={`/coach/crm/contacts/${dupe.id}`}>{dupe.full_name}</Link>.</> : 'That email is already in the CRM.');
      } else setError("Couldn't save. Try again.");
      return;
    }
    if (!contact) {
      await supabase.from('crm_activities').insert({ contact_id: res.data.id, kind: 'system', body: 'Added to the CRM by hand' });
      router.push(`/coach/crm/contacts/${res.data.id}`);
    } else {
      router.refresh();
    }
    onDone?.();
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        <L label="Name" wide><input value={f.full_name} onChange={(e) => set('full_name', e.target.value)} className={input} autoFocus={!contact} /></L>
        <L label="Email"><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} className={input} /></L>
        <L label="Phone / WhatsApp"><input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+356" className={input} /></L>
        <L label="Source">
          <select value={f.source} onChange={(e) => set('source', e.target.value)} className={input}>
            {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}
          </select>
        </L>
        {contact ? (
          <L label="Value (€ / month)"><input inputMode="decimal" value={f.value_eur} onChange={(e) => set('value_eur', e.target.value)} placeholder="e.g. 150" className={input} /></L>
        ) : (
          <L label="Stage">
            <select value={f.stage} onChange={(e) => set('stage', e.target.value)} className={input}>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </L>
        )}
        {!contact && <L label="Value (€ / month)" wide><input inputMode="decimal" value={f.value_eur} onChange={(e) => set('value_eur', e.target.value)} placeholder="Optional — e.g. 150" className={input} /></L>}
        <L label="Tags" wide><input value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="comma separated, e.g. hot, wedding, gym" className={input} /></L>
        {contact?.stage === 'lost' && <L label="Why lost?" wide><input value={f.lost_reason} onChange={(e) => set('lost_reason', e.target.value)} placeholder="e.g. Price, timing, went elsewhere" className={input} /></L>}
        <L label="Notes" wide><textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Key facts to remember — goals, budget, best time to call…" className={`${input} resize-y`} /></L>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        {onDone && <button onClick={onDone} className="flex-1 rounded-lg border border-border text-neutral-600 py-2 text-sm font-medium">Cancel</button>}
        <button onClick={save} disabled={busy} className="flex-1 rounded-lg bg-brand text-white py-2 text-sm font-medium disabled:opacity-50">
          {busy ? 'Saving…' : contact ? 'Save details' : 'Add contact'}
        </button>
      </div>
    </div>
  );
}

function L({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? 'col-span-2' : ''}`}>
      <span className="text-2xs text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
