'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { localDateStr } from '@/lib/date';
import type { CrmBrand, CrmPackage, CrmPaymentPlan } from '@/lib/supabase/database.types';
import { BRAND_META, IBF_MEAL_PLAN_PRICE, PACKAGES, PACKAGE_META, PAYMENT_METHODS, packageEnd } from '@/lib/crm/constants';
import { buildSchedule } from '@/lib/crm/payments';
import { euroExact as euro, shortDate } from '@/lib/crm/format';

type Initial = { package: CrmPackage | null; /** free (complimentary) client */ isFree?: boolean; price: number | null; /** price before a discount, if one was applied */ listPrice: number | null; start: string | null; plan: CrmPaymentPlan | null; method: string | null };

// What a client bought and how they pay: 1-1 coaching (3-month offer, 6
// months, 1 year) or a meal plan; paid in full or monthly; and the method.
// An optional discount (% or € off, with a reason) comes off the price; what's
// stored as the package price is always what they actually pay, with the
// pre-discount price kept alongside. Saving marks them a Client and (re)builds their payment schedule — paid
// payments are always kept, only the unpaid ones are recalculated.
export default function CrmPackageEditor({ contactId, brand, initial, defaultStart, suggestedPrices }: {
  contactId: string;
  brand: CrmBrand;
  initial: Initial;
  /** e.g. the day their client account was created */
  defaultStart: string;
  /** standard price of each package (set by the coach, else the most common so far), to pre-fill */
  suggestedPrices: Partial<Record<CrmPackage, number>>;
}) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  // IronBodyFit meal plans are €10, not the Vitality meal-plan price.
  const priceFor = (p: CrmPackage) => (p === 'meal_plan' && brand === 'ironbodyfit' ? IBF_MEAL_PLAN_PRICE : suggestedPrices[p] ?? PACKAGE_META[p].defaultPrice);
  const [editing, setEditing] = useState(!initial.package);
  const [pkg, setPkg] = useState<CrmPackage>(initial.package ?? '6_months');
  // `price` is the price before any discount.
  const [price, setPrice] = useState(() => {
    const v = initial.listPrice ?? initial.price ?? priceFor(initial.package ?? '6_months');
    return v != null ? String(v) : '';
  });
  const hadDiscount = initial.listPrice != null && initial.price != null && initial.listPrice > initial.price;
  const [discOpen, setDiscOpen] = useState(hadDiscount);
  const [discMode, setDiscMode] = useState<'pct' | 'eur'>('eur');
  const [discValue, setDiscValue] = useState(hadDiscount ? String(Math.round((initial.listPrice! - initial.price!) * 100) / 100) : '');
  const [discReason, setDiscReason] = useState('');
  // A free client keeps every perk of their package but has no price and no payments (never counted as revenue).
  const [free, setFree] = useState(initial.isFree ?? false);
  const [plan, setPlan] = useState<CrmPaymentPlan>(initial.plan ?? 'full');
  const [method, setMethod] = useState(initial.method ?? 'Card');
  const [start, setStart] = useState(initial.start ?? defaultStart);
  const [receivedNow, setReceivedNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [makeStandard, setMakeStandard] = useState(false);
  const priceRef = useRef<HTMLInputElement>(null);
  // A price counts as custom when it isn't the package's standard price or one of its listed options (e.g. Early bird).
  const isCustomPrice = (p: CrmPackage, amount: number | null) => {
    const std = priceFor(p);
    return amount != null && std != null && amount !== std && !(PACKAGE_META[p].prices ?? []).some((o) => o.price === amount);
  };

  const meta = PACKAGE_META[pkg];
  const isMealPlan = meta.kind === 'meal_plan';
  // Meal plans and the 8-Week Challenge are single payments; only 1-1 coaching can be monthly.
  const payInFullOnly = meta.kind !== 'coaching';
  const effectivePlan: CrmPaymentPlan = payInFullOnly ? 'full' : plan;

  const list = Number(price);
  const dv = Number(discValue);
  const rawDiscount = discOpen && Number.isFinite(dv) && dv > 0 && Number.isFinite(list) ? (discMode === 'pct' ? (list * Math.min(dv, 100)) / 100 : dv) : 0;
  const discount = Math.round(Math.min(Math.max(rawDiscount, 0), Number.isFinite(list) ? list : 0) * 100) / 100;
  // What the client actually pays.
  const finalPrice = Math.round((list - discount) * 100) / 100;

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
    if (!free && (!price.trim() || !Number.isFinite(list) || list < 0)) { setError('Enter the total price, in €.'); return; }
    if (!free && discOpen && discValue.trim() && (!Number.isFinite(dv) || dv < 0)) { setError('Enter the discount as a number.'); return; }
    if (!free && discOpen && discMode === 'pct' && dv > 100) { setError("A discount can't be more than 100%."); return; }
    if (!free && discOpen && discMode === 'eur' && dv > list) { setError("The discount can't be more than the price."); return; }
    const n = free ? 0 : finalPrice;
    const stdPrice = priceFor(pkg);
    const saveStandard = !free && makeStandard && !(pkg === 'meal_plan' && brand === 'ironbodyfit') && Number.isFinite(list) && list > 0 && list !== stdPrice;
    if (!start) { setError('Pick a start date.'); return; }
    setBusy(true);
    setError(null);
    const today = localDateStr();

    const { error: upErr } = await supabase.from('crm_contacts').update({
      package: pkg, package_price: n, package_list_price: !free && discount > 0 ? list : null, package_start: start, is_free: free,
      payment_plan: free ? 'full' : effectivePlan, payment_method: free ? null : method,
      stage: 'won', lost_reason: null,
    }).eq('id', contactId);
    if (upErr) { setBusy(false); setError("Couldn't save. Try again."); return; }

    // "Make this the new standard price": remember it for the next client who picks this package.
    if (saveStandard) {
      const { data: cs } = await supabase.from('coach_settings').select('package_prices').eq('id', 1).maybeSingle();
      await supabase.from('coach_settings').update({ package_prices: { ...(cs?.package_prices ?? {}), [pkg]: list } }).eq('id', 1);
    }

    // Rebuild the unpaid part of the schedule around what's already paid.
    const { data: existing } = await supabase.from('crm_payments').select('id, amount, paid_on').eq('contact_id', contactId);
    const paid = (existing || []).filter((p) => p.paid_on);
    await supabase.from('crm_payments').delete().eq('contact_id', contactId).is('paid_on', null);
    const rows = free ? [] : buildSchedule({
      price: n, plan: effectivePlan, months: meta.months, start,
      paidCount: paid.length, paidSum: paid.reduce((a, p) => a + Number(p.amount), 0),
    }).map((r, i) => ({
      ...r, contact_id: contactId, method,
      paid_on: !initial.package && receivedNow && paid.length === 0 && i === 0 ? today : null,
    }));
    if (rows.length) await supabase.from('crm_payments').insert(rows);

    const reason = discReason.trim();
    const customNote = !free && isCustomPrice(pkg, list) ? ` · custom price (standard ${euro(stdPrice ?? 0)})` : '';
    const discNote = discount > 0 ? ` · ${euro(list)} − ${discMode === 'pct' ? `${dv}%` : euro(discount)} discount${reason ? ` (${reason})` : ''}` : '';
    const how = effectivePlan === 'monthly' && meta.months ? `${meta.months} × ${euro(n / meta.months)} monthly` : 'paid in full';
    await supabase.from('crm_activities').insert({
      contact_id: contactId, kind: 'system',
      body: free
        ? `${initial.package ? 'Package updated' : 'Joined'}: ${packageName(pkg, brand)} · FREE client (no payment, not counted as revenue) · starts ${shortDate(start)}`
        : `${initial.package ? 'Package updated' : 'Joined'}: ${packageName(pkg, brand)} · ${euro(n)}${customNote}${discNote} (${how}, ${method.toLowerCase()}) · starts ${shortDate(start)}`,
      meta: { package: pkg, price: n, list_price: free ? null : list, discount: free ? 0 : discount, discount_reason: free ? null : (reason || null), free, start, plan: free ? 'full' : effectivePlan, method: free ? null : method },
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
        <span className={`rounded-xl px-3 py-2 text-center flex-shrink-0 ${m.kind === 'meal_plan' ? BRAND_META[brand].chip : m.kind === 'challenge' ? 'bg-[#e8f7f3] text-[#26A88A]' : 'bg-brand-light text-brand-dark'}`}>
          <span className="block text-base font-semibold leading-tight">{m.label}</span>
          <span className="block text-3xs uppercase tracking-wide opacity-70">{m.kind === 'meal_plan' ? BRAND_META[brand].label : m.kind === 'challenge' ? 'Vitality' : '1-1 coaching'}</span>
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p>
            {initial.isFree ? <b className="text-[#7c5cd6]">Free</b> : <b>{initial.price != null ? euro(initial.price) : '–'}</b>}
            {!initial.isFree && isCustomPrice(initial.package, initial.listPrice ?? initial.price) && <span className="ml-1.5 rounded-full bg-[#f1ecfc] px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-[#7c5cd6]">Custom</span>}
            {initial.listPrice != null && initial.price != null && initial.listPrice > initial.price && (
              <span className="ml-1 text-neutral-300 line-through">{euro(initial.listPrice)}</span>
            )}
            <span className="text-neutral-400"> · {initial.isFree ? 'no payments · not in revenue' : monthly ? `${m.months} × ${euro(initial.price! / m.months!)}/mo` : 'paid in full'}{!initial.isFree && initial.method ? ` · ${initial.method}` : ''}</span>
          </p>
          <p className="text-2xs text-neutral-400">{end ? `${shortDate(initial.start)} → ${shortDate(end)} ${end.slice(0, 4)}` : `Bought ${shortDate(initial.start)}`}</p>
        </div>
        <button onClick={() => setEditing(true)} className="text-xs font-medium text-brand-dark hover:opacity-70">Edit</button>
      </div>
    );
  }

  const n = finalPrice;
  const end = start ? packageEnd(start, pkg) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1" role="group" aria-label="Paying or free">
        {([[false, 'Paying client'], [true, 'Free client 🎁']] as const).map(([k, label]) => (
          <button key={String(k)} type="button" onClick={() => setFree(k)} aria-pressed={free === k}
            className={`rounded-md py-1.5 text-xs font-semibold ${free === k ? 'bg-surface text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-neutral-500'}`}>{label}</button>
        ))}
      </div>
      {free && <p className="rounded-lg bg-[#f1ecfc] px-3 py-2 text-2xs text-[#4b34a0]">Someone you train for free: they get every perk of the package below (booking calls, Academy, the app), but no price is recorded, no payments are created, and they&rsquo;re never counted in revenue.</p>}
      <div>
        <p className="text-2xs text-neutral-500 mb-1.5">1-1 coaching</p>
        <div className="grid grid-cols-3 gap-2">
          {PACKAGES.filter((p) => p.kind === 'coaching').map((p) => (
            <Choice key={p.key} on={pkg === p.key} onClick={() => choose(p.key)} title={p.label} sub={p.note ?? (priceFor(p.key) != null ? `usually ${euro(priceFor(p.key)!)}` : `${p.months} months`)} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-2xs text-neutral-500 mb-1.5">8-Week Challenge</p>
        <Choice on={pkg === '8_week_challenge'} onClick={() => choose('8_week_challenge')} title="Vitality 8-Week Challenge" sub={`one payment · ${PACKAGE_META['8_week_challenge'].prices!.map((o) => `${o.label} ${euro(o.price)}`).join(' / ')}`} wide />
      </div>
      <div>
        <p className="text-2xs text-neutral-500 mb-1.5">Meal plan</p>
        <Choice on={pkg === 'meal_plan'} onClick={() => choose('meal_plan')} title={`${BRAND_META[brand].label} meal plan`} sub={`one-off · ${euro(priceFor('meal_plan') ?? 69.99)}`} wide />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {!free && <label className="flex flex-col gap-1">
          <span className="text-2xs text-neutral-500">Total price (€)</span>
          <input ref={priceRef} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} placeholder="e.g. 900" className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>}
        <label className="flex flex-col gap-1">
          <span className="text-2xs text-neutral-500">{isMealPlan ? 'Bought on' : meta.kind === 'challenge' ? 'Challenge starts' : 'Start date'}</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
      </div>

      {!free && (
        <div className="flex flex-col gap-2 -mt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-2xs text-neutral-500">Price:</span>
            {(meta.prices ?? (priceFor(pkg) != null ? [{ label: 'Standard', price: priceFor(pkg)! }] : [])).map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => { setPrice(String(o.price)); setMakeStandard(false); }}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${Number(price) === o.price ? 'border-brand bg-brand text-white' : 'border-border text-neutral-600 hover:border-neutral-300'}`}
              >
                {o.label} · {euro(o.price)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setPrice(''); setTimeout(() => priceRef.current?.focus(), 0); }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${isCustomPrice(pkg, Number.isFinite(list) && price.trim() ? list : null) ? 'border-[#7c5cd6] bg-[#7c5cd6] text-white' : 'border-border text-neutral-600 hover:border-neutral-300'}`}
            >
              ✎ Custom price
            </button>
          </div>
          {isCustomPrice(pkg, Number.isFinite(list) && price.trim() ? list : null) && !(pkg === 'meal_plan' && brand === 'ironbodyfit') && (
            <label className="flex items-start gap-2 text-2xs text-neutral-600">
              <input type="checkbox" checked={makeStandard} onChange={(e) => setMakeStandard(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
              <span>Only for this client. Tick to make {euro(list)} the new standard price for {packageName(pkg, brand)} instead.</span>
            </label>
          )}
        </div>
      )}

      {free ? null : !discOpen ? (
        <button type="button" onClick={() => setDiscOpen(true)} className="self-start -mt-1 text-xs font-medium text-brand-dark hover:opacity-70">＋ Apply a discount</button>
      ) : (
        <div className="rounded-xl border border-border p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Discount</p>
            <button type="button" onClick={() => { setDiscOpen(false); setDiscValue(''); setDiscReason(''); }} className="text-2xs text-neutral-400 hover:text-neutral-700">Remove</button>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
            {([['pct', '% off'], ['eur', '€ off']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => { setDiscMode(k); setDiscValue(''); }}
                className={`rounded-md py-1.5 text-xs font-semibold ${discMode === k ? 'bg-surface text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-neutral-500'}`}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(discMode === 'pct' ? [10, 15, 20, 25, 50] : [10, 20, 25, 50]).map((v) => (
              <button key={v} type="button" onClick={() => setDiscValue(String(v))}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${Number(discValue) === v ? 'border-brand bg-brand text-white' : 'border-border text-neutral-600 hover:border-neutral-300'}`}>
                {discMode === 'pct' ? `${v}%` : `€${v}`}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-2xs text-neutral-500">{discMode === 'pct' ? 'Percent off' : 'Euros off'}</span>
              <input inputMode="decimal" value={discValue} onChange={(e) => setDiscValue(e.target.value.replace(',', '.'))} placeholder={discMode === 'pct' ? 'e.g. 15' : 'e.g. 30'} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs text-neutral-500">Reason (optional)</span>
              <input value={discReason} onChange={(e) => setDiscReason(e.target.value)} maxLength={80} placeholder="e.g. friend referral, code SUMMER" className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
            </label>
          </div>
          <p className="text-xs text-neutral-600">
            {discount > 0
              ? <><span className="text-neutral-400 line-through">{euro(list)}</span> − {euro(discount)} → client pays <b>{euro(finalPrice)}</b></>
              : 'Enter an amount to see the new price'}
          </p>
        </div>
      )}

      {free ? (
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-2xs text-neutral-600">Free client{end ? <> · ends {shortDate(end)} {end.slice(0, 4)}</> : null}</p>
      ) : (
        <>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-2xs text-neutral-500">How they pay</span>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
            {(['full', 'monthly'] as const).map((k) => (
              <button
                key={k}
                type="button"
                disabled={payInFullOnly && k === 'monthly'}
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

        </>
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
  return pkg === 'meal_plan' ? `${BRAND_META[brand].label} meal plan` : pkg === '8_week_challenge' ? 'Vitality 8-Week Challenge' : `${PACKAGE_META[pkg].label} 1-1 coaching`;
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
