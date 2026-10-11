'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { localDateStr } from '@/lib/date';
import { PAYMENT_METHODS } from '@/lib/crm/constants';
import { euro, shortDate } from '@/lib/crm/format';

export type CrmPaymentItem = { id: string; contact_id: string; amount: number; due_on: string; paid_on: string | null; method: string | null; note: string; contactName?: string };

// A payment ledger: tick a payment as received (cash collected), or untick
// it. With contactId it also shows totals and lets you add a one-off payment.
// Used on a contact (their schedule) and the CRM overview (what's due).
export default function CrmPayments({ payments, contactId, emptyText }: { payments: CrmPaymentItem[]; contactId?: string; emptyText: string }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [today] = useState(() => localDateStr());
  const [paidOverride, setPaidOverride] = useState<Record<string, string | null>>({});
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => localDateStr());
  const [method, setMethod] = useState('Card');
  const [busy, setBusy] = useState(false);

  const paidOn = (p: CrmPaymentItem) => (p.id in paidOverride ? paidOverride[p.id] : p.paid_on);

  async function toggle(p: CrmPaymentItem) {
    const next = paidOn(p) ? null : today;
    setPaidOverride((o) => ({ ...o, [p.id]: next }));
    await supabase.from('crm_payments').update({ paid_on: next }).eq('id', p.id);
    if (next) await supabase.from('crm_activities').insert({ contact_id: p.contact_id, kind: 'system', body: `Payment received: ${euro(Number(p.amount))}${p.method ? ` · ${p.method}` : ''}` });
    router.refresh();
  }

  async function add() {
    const n = Number(amount.replace(',', '.'));
    if (!contactId || !Number.isFinite(n) || n <= 0 || busy) return;
    setBusy(true);
    const { error } = await supabase.from('crm_payments').insert({ contact_id: contactId, amount: n, due_on: date, paid_on: date, method, note: 'Added by hand' });
    if (!error) await supabase.from('crm_activities').insert({ contact_id: contactId, kind: 'system', body: `Payment received: ${euro(n)} · ${method}` });
    setBusy(false);
    if (!error) { setAdding(false); setAmount(''); router.refresh(); }
  }

  const total = payments.reduce((a, p) => a + Number(p.amount), 0);
  const collected = payments.filter((p) => paidOn(p)).reduce((a, p) => a + Number(p.amount), 0);

  return (
    <div>
      {contactId && payments.length > 0 && (
        <div className="mb-3">
          <div className="flex items-baseline justify-between text-sm">
            <span><b>{euro(collected)}</b> <span className="text-neutral-400">collected of {euro(total)}</span></span>
            {total - collected > 0.004 && <span className="text-2xs text-neutral-500">{euro(total - collected)} to come</span>}
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
            <div className="h-full rounded-full bg-status-good transition-[width]" style={{ width: `${total ? Math.min(100, (collected / total) * 100) : 0}%` }} />
          </div>
        </div>
      )}
      {payments.length === 0 && <p className="text-sm text-neutral-400 mb-2">{emptyText}</p>}
      <div className="flex flex-col gap-1.5">
        {payments.map((p) => {
          const paid = paidOn(p);
          const overdue = !paid && p.due_on < today;
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-lg bg-neutral-50 px-3 py-2">
              <button
                onClick={() => toggle(p)}
                aria-label={paid ? 'Mark as not received' : 'Mark as received'}
                className={`w-5 h-5 rounded-md flex items-center justify-center text-xs flex-shrink-0 ${paid ? 'bg-status-good text-white' : overdue ? 'border border-status-bad bg-white' : 'border border-neutral-300 bg-white'}`}
              >{paid ? '✓' : ''}</button>
              <div className="min-w-0 flex-1">
                <p className="text-sm"><b className="tabular-nums">{euro(Number(p.amount))}</b>{p.method && <span className="text-neutral-400"> · {p.method}</span>}</p>
                {p.contactName && <Link href={`/coach/crm/contacts/${p.contact_id}`} className="text-2xs text-brand-dark hover:underline">{p.contactName}</Link>}
              </div>
              <span className={`text-2xs flex-shrink-0 ${paid ? 'text-status-good-text' : overdue ? 'text-status-bad-text font-medium' : 'text-neutral-400'}`}>
                {paid ? `Paid ${shortDate(paid)}` : overdue ? `Overdue · ${shortDate(p.due_on)}` : `Due ${shortDate(p.due_on)}`}
              </span>
            </div>
          );
        })}
      </div>

      {contactId && (adding ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 w-24">
            <span className="text-2xs text-neutral-500">Amount €</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand" autoFocus />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs text-neutral-500">Paid on</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand" />
          </label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none bg-surface">
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <button onClick={add} disabled={busy} className="rounded-lg bg-brand text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50">Add</button>
          <button onClick={() => setAdding(false)} className="text-xs text-neutral-400">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-3 text-xs font-medium text-brand-dark hover:opacity-70">+ Record a payment</button>
      ))}
    </div>
  );
}
