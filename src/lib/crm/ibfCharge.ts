import type { createAdminClient } from '@/lib/supabase/admin';
import { coachToday } from '@/lib/date';
import { euro } from '@/lib/crm/format';
import { IBF_MEAL_PLAN_PRICE, IBF_PLAN_NOTE } from '@/lib/crm/constants';

type Admin = ReturnType<typeof createAdminClient>;

// Every IronBodyFit meal-plan form is a €10 sale: the same record the coach's
// "Charged €10?" switch (CrmIbfPaid) makes — a €10 meal-plan package from that
// day plus one paid €10 payment — so it counts in revenue and cash collected.
// Once per person: a second form from the same person doesn't charge again —
// even when it made a second CRM contact, matched like the meal-plan inbox by
// name (ignoring case and spacing) or the last 8 digits of the phone — and a
// contact the coach already marked (or later unmarks) is left alone.
// Server-side with the service-role client; never throws.
export async function chargeIbfMealPlan(admin: Admin, contactId: string): Promise<void> {
  try {
    const { data: existing } = await admin.from('crm_payments').select('id').eq('contact_id', contactId).eq('note', IBF_PLAN_NOTE).limit(1);
    if (existing?.length) return;
    const { data: contact } = await admin.from('crm_contacts').select('full_name, phone, package, package_price').eq('id', contactId).single();
    // A 1-1 client who also asked for a meal plan keeps their own package.
    if (!contact || (contact.package && contact.package !== 'meal_plan')) return;
    if (await alreadyChargedAsSomeoneElse(admin, contact)) return;

    const day = coachToday();
    const { error: upErr } = await admin.from('crm_contacts')
      .update({ package: 'meal_plan', package_price: IBF_MEAL_PLAN_PRICE, package_start: day, payment_plan: 'full' })
      .eq('id', contactId);
    if (upErr) throw upErr;
    const { error: payErr } = await admin.from('crm_payments')
      .insert({ contact_id: contactId, amount: IBF_MEAL_PLAN_PRICE, due_on: day, paid_on: day, note: IBF_PLAN_NOTE });
    if (payErr) throw payErr;
    await admin.from('crm_activities').insert({ contact_id: contactId, kind: 'system', body: `Meal plan charged ${euro(IBF_MEAL_PLAN_PRICE)} — paid (IronBodyFit form)` });
  } catch (err) {
    console.error('IronBodyFit €10 charge failed', { contactId, message: err instanceof Error ? err.message : String(err) });
  }
}

const nameKey = (n: string | null) => (n ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const phoneKey = (p: string | null) => (p ?? '').replace(/\D/g, '').slice(-8);

async function alreadyChargedAsSomeoneElse(admin: Admin, contact: { full_name: string | null; phone: string | null }): Promise<boolean> {
  const { data: paid } = await admin.from('crm_payments').select('contact_id').eq('note', IBF_PLAN_NOTE);
  const ids = [...new Set((paid ?? []).map((p) => p.contact_id))];
  if (!ids.length) return false;
  const { data: others } = await admin.from('crm_contacts').select('full_name, phone').in('id', ids);
  const name = nameKey(contact.full_name);
  const phone = phoneKey(contact.phone);
  return (others ?? []).some((o) => (name && nameKey(o.full_name) === name) || (phone.length === 8 && phoneKey(o.phone) === phone));
}
