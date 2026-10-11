'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { localDateStr } from '@/lib/date';
import type { CrmBrand, CrmPackage, CrmPaymentPlan } from '@/lib/supabase/database.types';
import { BRAND_META, PACKAGES, PACKAGE_META, PAYMENT_METHODS, packageEnd } from '@/lib/crm/constants';
import { buildSchedule } from '@/lib/crm/payments';
import { euro, shortDate } from '@/lib/crm/format';

type Initial = { package: CrmPackage | null; price: number | null; start: string | null; plan: CrmPaymentPlan | null; method: string | null };

// What a client bought and how they pay: 1-1 coaching (3-month offer, 6
// months, 1 year) or a meal plan; paid in full or monthly; and the method.
// Saving marks them a Client and (re)builds their payment schedule — paid
// payments are always kept, only the unpaid ones are recalculated.
export default function CrmPackageEditor({ contactId, brand, initial, defaultStart, suggestedPrices }: {
  contactId: string;
  brand: CrmBrand;
  initial: Initial;
  /** e.g. the day their client account was created */
  defaultStart: string;
  /** last price used for each package, to pre-fill */
  suggestedPrices: Partial<Record<CrmPackage, number>>;
}) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const priceFor = (p: CrmPackage) => suggestedPrices[p] ?? PACKAGE_META[p].defaultPrice;
  const [editing, setEditing] = useState(!initial.package);
  const [pkg, setPkg] = useState<CrmPackage>(initial.package ?? '6_months');
  const [price, setPrice] = useState(() => {
    const v = initial.price ?? priceFor(initial.package ?? '6_months');
    return v != null ? String(v) : '';
  });
  const [plan, setPlan] = useState<CrmPaymentPlan>(initial.plan ?? 'full');
  const [method, setMethod] = useState(initial.method ?? 'Card');
  const [start, setStart] = useState(initial.start ?? defaultStart);
  const [receivedNow, setReceivedNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = PACKAGE_META[pkg];
  const isMealPlan = meta.kind === 'meal_plan';
  const effectivePlan: CrmPaymentPlan = isMealPlan ? 'full' : plan;

  function choose(p: CrmPackage) {
    const prevSuggested = priceFor(pkg);
    setPkg(p);
    // Swap in the usual price for the new choice unless a custom one was typed.
    if (!price || (prevSuggested != null && Number(price) === prevSuggested)) {
      const next = priceFor(p);
      setPrice(next != null ? String(next) : '');
    }
  }

  async function save() {
    const n = Number(price);
    if (!price.trim() || !Number.isFinite(n) || n < 0) { setError('Enter the total price, in €.'); return; }
    if (!start) { setError('Pick a start date.'); return; }
    setBusy(true);
    setError(null);
    const today = localDateStr();

    const { error: upErr } = await supabase.from('crm_contacts').update({
      package: pkg, package_price: n, package_start: start,
      payment_plan: effectivePlan, payment_method: method,
      stage: 'won', lost_reason: null,
    }).eq('id', contactId);
    if (upErr) { setBusy(false); setError("Couldn't save. Try again."); return; }

    // Rebuild the unpaid part of the schedule around what's already paid.
    const { data: existing } = await supabase.from('crm_payments').select('id, amount, paid_on').eq('contact_id', contactId);
    const paid = (existing || []).filter((p) => p.paid_on);
    await supabase.from('crm_payments').delete().eq('contact_id', contactId).is('paid_on', null);
    const rows = buildSchedule({
      price: n, plan: effectivePlan, months: meta.months, start,
      paidCount: paid.length, paidSum: paid.reduce((a, p) => a + Number(p.amount), 0),
    }).map((r, i) => ({
      ...r, contact_id: contactId, method,
      paid_on: !initial.package && receivedNow && paid.length === 0 && i === 0 ? today : null,
    }));
    if (rows.length) await supabase.from('crm_payments').insert(rows);

    const how = effectivePlan === 'monthly' && meta.months ? `${meta.months} × ${euro(n / meta.months)} monthly` : 'paid in full';
    await supabase.from('crm_activities').insert({
      contact_id: contactId, kind: 'system',
      body: `${initial.package ? 'Package updated' : 'Joined'}: ${packageName(pkg, brand)} · ${euro(n)} (${how}, ${method.toLowerCase()}) · starts ${shortDate(start)}`,
      meta: { package: pkg, price: n, start, plan: effectivePlan, method },
    });
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  if (!editing && initial.package && initial.start) {
    const m = PACKAGE_META[initial.package];
    const end = packageEnd(initial.start, initial.package);
    const monthly = initial.plan === 'monthly' && m.months && initial.price != null;
    return (
      <div className="flex items-center gap-3">
        <span className={`rounded-xl px-3 py-2 text-center flex-shrink-0 ${m.kind === 'meal_plan' ? BRAND_META[brand].chip : 'bg-brand-light text-brand-dark'}`}>
          <span className="block text-base font-semibold leading-tight">{m.label}</span>
          <span className="block text-3xs uppercase tracking-wide opacity-70">{m.kind === 'meal_plan' ? BRAND_META[brand].label : '1-1 coaching'}</span>
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p>
            <b>{initial.price != null ? euro(initial.price) : '–'}</b>
            <span className="text-neutral-400"> · {monthly ? `${m.months} × ${euro(initial.price! / m.months!)}/mo` : 'paid in full'}{initial.method ? ` · ${initial.method}` : ''}</span>
          </p>
          <p className="text-2xs text-neutral-400">{end ? `${shortDate(initial.start)} → ${shortDate(end)} ${end.slice(0, 4)}` : `Bought ${shortDate(initial.start)}`}</p>
        </div>
        <button onClick={() => setEditing(true)} className="text-xs font-medium text-brand-dark hover:opacity-70">Edit</button>
      </div>
    );
  }

  const n = Number(price);
  const end = start ? packageEnd(start, pkg) : null;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-2xs text-neutral-500 mb-1.5">1-1 coaching</p>
        <div className="grid grid-cols-3 gap-2">
          {PACKAGES.filter((p) => p.kind === 'coaching').map((p) => (
            <Choice key={p.key} on={pkg === p.key} onClick={() => choose(p.key)} title={p.label} sub={p.note ?? (priceFor(p.key) != null ? `usually ${euro(priceFor(p.key)!)}` : `${p.months} months`)} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-2xs text-neutral-500 mb-1.5">Meal plan</p>
        <Choice on={pkg === 'meal_plan'} onClick={() => choose('meal_plan')} title={`${BRAND_META[brand].label} meal plan`} sub={`one-off · ${euro(priceFor('meal_plan') ?? 69.99)}`} wide />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-2xs text-neutral-500">Total price (€)</span>
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} placeholder="e.g. 900" className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-2xs text-neutral-500">{isMealPlan ? 'Bought on' : 'Start date'}</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-2xs text-neutral-500">How they pay</span>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
            {(['full', 'monthly'] as const).map((k) => (
              <button
                key={k}
                type="button"
                disabled={isMealPlan && k === 'monthly'}
                onClick={() => setPlan(k)}
                className={`rounded-md py-1.5 text-xs font-semibold disabled:opacity-30 ${effectivePlan === k ? 'bg-surface text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-neutral-500'}`}
              >{k === 'full' ? 'In full' : 'Monthly'}</button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-2xs text-neutral-500">Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand bg-surface">
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
      </div>

      <p className="rounded-lg bg-neutral-50 px-3 py-2 text-2xs text-neutral-600">
        {Number.isFinite(n) && n > 0
          ? effectivePlan === 'monthly' && meta.months
            ? <>{meta.months} payments of <b>{euro(n / meta.months)}</b> a month</>
            : <>One payment of <b>{euro(n)}</b></>
          : 'Enter the price to see the payments'}
        {end ? <> · ends {shortDate(end)} {end.slice(0, 4)}</> : null}
      </p>

      {!initial.package && (
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={receivedNow} onChange={(e) => setReceivedNow(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          {effectivePlan === 'monthly' ? 'First payment received today' : 'Payment received today'}
        </label>
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

export function packageName(pkg: CrmPackage, brand: CrmBrand): string {
  return pkg === 'meal_plan' ? `${BRAND_META[brand].label} meal plan` : `${PACKAGE_META[pkg].label} 1-1 coaching`;
}

function Choice({ on, onClick, title, sub, wide }: { on: boolean; onClick: () => void; title: string; sub: string; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-left ${wide ? 'w-full' : ''} ${on ? 'border-brand bg-brand-light/70 ring-2 ring-brand/15' : 'border-border hover:border-neutral-300'}`}
    >
      <span className={`block text-sm font-semibold ${on ? 'text-brand-dark' : ''}`}>{title}</span>
      <span className="block text-2xs text-neutral-400 truncate">{sub}</span>
    </button>
  );
}
