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
    if (!confirm(`Remove ${name} from the CRM?\n\nTheir timeline, follow-ups and payment records are deleted. Their app account and form submissions are not affected.`)) return;
    setBusy(true);
    const { error } = await supabase.from('crm_contacts').delete().eq('id', id);
    setBusy(false);
    if (!error) { router.push('/coach/crm/contacts'); router.refresh(); }
  }
  return <button onClick={del} disabled={busy} className="rounded-lg border border-status-bad/30 px-3 py-1.5 text-xs font-medium text-status-bad-text hover:bg-status-bad-bg disabled:opacity-50">Remove from CRM</button>;
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

// Small bin button at the end of a contact row: removes them from the CRM
// only (their app account and form submissions stay).
export function CrmRowDelete({ id, name }: { id: string; name: string }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!confirm(`Remove ${name} from the CRM?\n\nTheir timeline, follow-ups and payment records are deleted. Their app account and form submissions are not affected.`)) return;
    setBusy(true);
    const { error } = await supabase.from('crm_contacts').delete().eq('id', id);
    setBusy(false);
    if (!error) router.refresh();
  }
  return (
    <button
      onClick={del}
      disabled={busy}
      aria-label={`Remove ${name} from the CRM`}
      title="Remove from CRM"
      className="self-stretch px-3 text-neutral-300 hover:text-status-bad-text hover:bg-status-bad-bg rounded-r-xl transition-colors disabled:opacity-40"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
    </button>
  );
}

// Meal-plan status for contacts tagged plan-pending / plan-sent (e.g. the
// IronBodyFit client sheet): the same symbol everywhere — ✓ Sent (green) or
// ⏳ To send (amber) — and tapping it flips the status.
export function planStatus(tags: string[]): 'sent' | 'pending' | null {
  return tags.includes('plan-pending') ? 'pending' : tags.includes('plan-sent') ? 'sent' : null;
}

export function CrmPlanStatus({ id, tags, email, size = 'md' }: { id: string; tags: string[]; email?: string | null; size?: 'sm' | 'md' }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [override, setOverride] = useState<'sent' | 'pending' | null>(null);
  const status = override ?? planStatus(tags);
  if (!status) return null;
  async function flip(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = status === 'pending' ? 'sent' : 'pending';
    setOverride(next);
    setBusy(true);
    const nextTags = tags.filter((t) => t !== 'plan-pending' && t !== 'plan-sent').concat(`plan-${next}`);
    const { error } = await supabase.from('crm_contacts').update({ tags: nextTags }).eq('id', id);
    if (!error) {
      await supabase.from('crm_activities').insert({ contact_id: id, kind: 'system', body: next === 'sent' ? 'Meal plan sent out' : 'Meal plan marked as still to send' });
      // Keep their latest IronBodyFit form request in the inbox in step.
      if (email) {
        const { data: req } = await supabase.from('meal_plan_requests').select('id, status').eq('email', email).eq('source', 'ironbodyfit').order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (req && (next === 'sent' ? req.status !== 'sent' : req.status === 'sent')) {
          await supabase.from('meal_plan_requests').update({ status: next === 'sent' ? 'sent' : 'new' }).eq('id', req.id);
        }
      }
    }
    setBusy(false);
    if (error) setOverride(null);
    else router.refresh();
  }
  const sent = status === 'sent';
  const tone = sent
    ? 'bg-status-good-bg text-status-good-text border-status-good/30'
    : 'bg-status-warn-bg text-status-warn-text border-status-warn/40';
  const cls = size === 'sm' ? 'px-2 py-0.5 text-3xs' : 'px-3 py-1.5 text-xs';
  return (
    <button
      onClick={flip}
      disabled={busy}
      title={sent ? 'Meal plan sent — tap to mark as still to send' : 'Meal plan still to send — tap when sent'}
      aria-label={sent ? 'Meal plan sent. Tap to mark as still to send' : 'Meal plan still to send. Tap to mark as sent'}
      className={`relative inline-flex flex-shrink-0 items-center gap-1 rounded-full border font-semibold whitespace-nowrap transition-transform active:scale-95 disabled:opacity-60 ${tone} ${cls}`}
    >
      <span aria-hidden>{sent ? '✓' : '⏳'}</span>{sent ? 'Sent' : 'To send'}
    </button>
  );
}
