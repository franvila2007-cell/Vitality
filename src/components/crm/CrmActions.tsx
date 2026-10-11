'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { CrmContactRow } from '@/lib/supabase/database.types';
import CrmContactForm from '@/components/crm/CrmContactForm';

// "+ Add contact" button that opens the add form in a sheet.
export function CrmAddContactButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-lg bg-brand text-white px-3.5 py-2 text-sm font-medium hover:opacity-90">+ Add contact</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-surface rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold mb-1">Add a contact</p>
            <p className="text-xs text-neutral-400 mb-4">For leads from DMs, calls, events or referrals. Form submissions are added automatically.</p>
            <CrmContactForm onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

// Collapsible "Edit details" on a contact page.
export function CrmEditDetails({ contact }: { contact: CrmContactRow }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="text-xs font-medium text-brand-dark hover:opacity-70">Edit details</button>;
  return (
    <div className="mt-3 w-full">
      <CrmContactForm contact={contact} onDone={() => setOpen(false)} />
    </div>
  );
}

export function CrmDeleteContact({ id, name }: { id: string; name: string }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!confirm(`Delete ${name} from the CRM? Their timeline and follow-ups are deleted too. Client accounts and form submissions are not affected.`)) return;
    setBusy(true);
    const { error } = await supabase.from('crm_contacts').delete().eq('id', id);
    setBusy(false);
    if (!error) { router.push('/coach/crm/contacts'); router.refresh(); }
  }
  return <button onClick={del} disabled={busy} className="text-xs text-neutral-400 hover:text-status-bad-text disabled:opacity-50">Delete contact</button>;
}

// Copy-to-clipboard for funnel links on the overview.
export function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = `${window.location.origin}${path}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }
  return (
    <button onClick={copy} className={`flex-shrink-0 rounded-md border px-2 py-0.5 text-2xs font-medium ${copied ? 'border-status-good/40 text-status-good-text bg-status-good-bg' : 'border-border text-neutral-500 hover:text-neutral-800'}`}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
