'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { localDateStr } from '@/lib/date';
import { IBF_MEAL_PLAN_PRICE, IBF_PLAN_NOTE } from '@/lib/crm/constants';
import { euro, shortDate } from '@/lib/crm/format';

// "Charged €10?" for an IronBodyFit meal-plan client — some members pay, some
// don't. On: the contact gets a €10 package starting that day plus a paid €10
// payment, so it counts in revenue and cash collected everywhere. Off: price
// and that one payment are removed again. `sm` is the compact pill used on
// list rows; `md` is the labelled switch (with the date) on the contact page.
export default function CrmIbfPaid({ id, price, start, size = 'sm' }: { id: string; price: number | null; start: string | null; size?: 'sm' | 'md' }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [paid, setPaid] = useState((price ?? 0) > 0);
  const [date, setDate] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function turn(on: boolean, e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (busy) return;
    const prev = paid;
    setPaid(on);
    setBusy(true);
    setError(null);
    const day = date ?? localDateStr();

    const { error: upErr } = await supabase.from('crm_contacts').update(
      on ? { package: 'meal_plan', package_price: IBF_MEAL_PLAN_PRICE, package_start: day, payment_plan: 'full' } : { package_price: null },
    ).eq('id', id);
    let failed = !!upErr;

    if (!failed && on) {
      const { data: existing } = await supabase.from('crm_payments').select('id').eq('contact_id', id).eq('note', IBF_PLAN_NOTE).limit(1);
      if (!existing?.length) {
        const { error: payErr } = await supabase.from('crm_payments').insert({ contact_id: id, amount: IBF_MEAL_PLAN_PRICE, due_on: day, paid_on: day, note: IBF_PLAN_NOTE });
        failed = !!payErr;
      }
      if (!failed) setDate(day);
    } else if (!failed) {
      const { error: delErr } = await supabase.from('crm_payments').delete().eq('contact_id', id).eq('note', IBF_PLAN_NOTE);
      failed = !!delErr;
    }

    if (failed) { setPaid(prev); setError("Couldn't save — try again."); setBusy(false); return; }
    await supabase.from('crm_activities').insert({
      contact_id: id, kind: 'system',
      body: on ? `Meal plan charged ${euro(IBF_MEAL_PLAN_PRICE)} — paid` : 'Meal plan marked as not charged',
    });
    setBusy(false);
    router.refresh();
  }

  async function changeDate(next: string) {
    if (!next || next === date) return;
    setDate(next);
    await supabase.from('crm_contacts').update({ package_start: next }).eq('id', id);
    await supabase.from('crm_payments').update({ due_on: next, paid_on: next }).eq('contact_id', id).eq('note', IBF_PLAN_NOTE);
    router.refresh();
  }

  if (size === 'sm') {
    return (
      <button
        onClick={(e) => turn(!paid, e)}
        disabled={busy}
        title={paid ? `Charged ${euro(IBF_MEAL_PLAN_PRICE)} — tap if they didn't pay` : `Tap if this meal plan was charged ${euro(IBF_MEAL_PLAN_PRICE)}`}
        aria-label={paid ? `Meal plan charged ${euro(IBF_MEAL_PLAN_PRICE)}. Tap to mark as not charged` : `Mark meal plan as charged ${euro(IBF_MEAL_PLAN_PRICE)}`}
        aria-pressed={paid}
        className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-3xs font-semibold whitespace-nowrap transition-transform active:scale-95 disabled:opacity-60 ${
          paid ? 'border-status-good/30 bg-status-good-bg text-status-good-text' : 'border-dashed border-neutral-300 text-neutral-400 hover:text-neutral-700'
        }`}
      >
        {paid ? <>€{IBF_MEAL_PLAN_PRICE} ✓</> : <>+ €{IBF_MEAL_PLAN_PRICE}</>}
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Charged {euro(IBF_MEAL_PLAN_PRICE)} for the meal plan</p>
          <p className="text-2xs text-neutral-400">{paid ? 'Counted in revenue and cash collected.' : 'Switch on if they paid — it adds €10 to revenue.'}</p>
        </div>
        <button
          role="switch"
          aria-checked={paid}
          aria-label={`Meal plan charged ${euro(IBF_MEAL_PLAN_PRICE)}`}
          onClick={(e) => turn(!paid, e)}
          disabled={busy}
          className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors disabled:opacity-60 ${paid ? 'bg-status-good' : 'bg-neutral-300'}`}
        >
          <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${paid ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {paid && date && (
        <label className="mt-2 flex items-center gap-2 text-2xs text-neutral-500">
          Paid on
          <input type="date" value={date} max={localDateStr()} onChange={(e) => changeDate(e.target.value)} className="rounded-md border border-border bg-neutral-50 px-2 py-1 text-xs" />
          <span className="text-neutral-400">{shortDate(date)}</span>
        </label>
      )}
      {error && <p className="mt-2 text-2xs text-status-bad-text">{error}</p>}
    </div>
  );
}
