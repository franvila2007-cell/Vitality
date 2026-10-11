'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { CrmPackage } from '@/lib/supabase/database.types';
import { PACKAGES, PACKAGE_META, packageEnd } from '@/lib/crm/constants';
import { euro, shortDate } from '@/lib/crm/format';

// The package a client joined: 6 months or 1 year, what they paid, and when
// it started. Saving it also marks the contact as a Client. Shown on the
// CRM contact page and on the coach's client page.
export default function CrmPackageEditor({ contactId, initial, defaultStart, suggestedPrices }: {
  contactId: string;
  initial: { package: CrmPackage | null; price: number | null; start: string | null };
  /** e.g. the day their client account was created */
  defaultStart: string;
  /** last price used for each package, to pre-fill */
  suggestedPrices: Partial<Record<CrmPackage, number>>;
}) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [editing, setEditing] = useState(!initial.package);
  const [pkg, setPkg] = useState<CrmPackage>(initial.package ?? '12_months');
  const [price, setPrice] = useState(initial.price != null ? String(initial.price) : suggestedPrices[initial.package ?? '12_months'] != null ? String(suggestedPrices[initial.package ?? '12_months']) : '');
  const [start, setStart] = useState(initial.start ?? defaultStart);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(p: CrmPackage) {
    setPkg(p);
    // Swap in the usual price for that package unless one was typed in.
    const fromOther = suggestedPrices[pkg] != null && price === String(suggestedPrices[pkg]);
    if ((!price || fromOther) && suggestedPrices[p] != null) setPrice(String(suggestedPrices[p]));
  }

  async function save() {
    const n = Number(price);
    if (!price.trim() || !Number.isFinite(n) || n < 0) { setError('Enter what they paid, in €.'); return; }
    if (!start) { setError('Pick a start date.'); return; }
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('crm_contacts')
      .update({ package: pkg, package_price: n, package_start: start, stage: 'won', lost_reason: null })
      .eq('id', contactId);
    if (!error) {
      await supabase.from('crm_activities').insert({
        contact_id: contactId, kind: 'system',
        body: `${initial.package ? 'Package updated' : 'Joined'}: ${PACKAGE_META[pkg].label} · ${euro(n)} · starts ${shortDate(start)}`,
        meta: { package: pkg, price: n, start },
      });
    }
    setBusy(false);
    if (error) { setError("Couldn't save. Try again."); return; }
    setEditing(false);
    router.refresh();
  }

  if (!editing && initial.package && initial.start) {
    const end = packageEnd(initial.start, initial.package);
    const months = PACKAGE_META[initial.package].months;
    return (
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-brand-light text-brand-dark px-3 py-2 text-center flex-shrink-0">
          <span className="block text-base font-semibold leading-tight">{PACKAGE_META[initial.package].label}</span>
          <span className="block text-3xs uppercase tracking-wide opacity-70">package</span>
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p><b>{initial.price != null ? euro(initial.price) : '–'}</b>{initial.price != null && <span className="text-neutral-400"> · ≈ {euro(initial.price / months)}/mo</span>}</p>
          <p className="text-2xs text-neutral-400">{shortDate(initial.start)} → {shortDate(end)} {new Date(end).getUTCFullYear()}</p>
        </div>
        <button onClick={() => setEditing(true)} className="text-xs font-medium text-brand-dark hover:opacity-70">Edit</button>
      </div>
    );
  }

  const n = Number(price);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {PACKAGES.map((p) => (
          <button
            key={p.key}
            onClick={() => choose(p.key)}
            className={`rounded-xl border px-3 py-3 text-left ${pkg === p.key ? 'border-brand bg-brand-light/70 ring-2 ring-brand/15' : 'border-border hover:border-neutral-300'}`}
          >
            <span className={`block text-sm font-semibold ${pkg === p.key ? 'text-brand-dark' : ''}`}>{p.label}</span>
            <span className="block text-2xs text-neutral-400">{suggestedPrices[p.key] != null ? `usually ${euro(suggestedPrices[p.key]!)}` : `${p.months} months of coaching`}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-2xs text-neutral-500">Price paid (€ total)</span>
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} placeholder="e.g. 900" className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-2xs text-neutral-500">Start date</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
      </div>
      {start && (
        <p className="text-2xs text-neutral-400">
          Ends {shortDate(packageEnd(start, pkg))} {new Date(packageEnd(start, pkg)).getUTCFullYear()}
          {Number.isFinite(n) && n > 0 && <> · ≈ {euro(n / PACKAGE_META[pkg].months)} a month</>}
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        {initial.package && <button onClick={() => setEditing(false)} className="flex-1 rounded-lg border border-border text-neutral-600 py-2 text-sm font-medium">Cancel</button>}
        <button onClick={save} disabled={busy} className="flex-1 rounded-lg bg-brand text-white py-2 text-sm font-medium disabled:opacity-50">
          {busy ? 'Saving…' : 'Save package'}
        </button>
      </div>
    </div>
  );
}
