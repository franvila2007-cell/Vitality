import type { createAdminClient } from '@/lib/supabase/admin';
import type { CrmBrand, CrmContactRow, CrmStage } from '@/lib/supabase/database.types';
import { brandForSource } from '@/lib/crm/constants';

type Admin = ReturnType<typeof createAdminClient>;

// Records a funnel event on the matching CRM contact (by email — or, for
// forms that don't ask for one like IronBodyFit's, by name within the
// brand), creating
// the contact if it's new. Called server-side from every public form route
// with the service-role client, after the submission itself is saved.
// Never throws: for forms that save their own submission the CRM is a side
// effect, so a failure here must not turn a saved submission into an error.
// Returns whether the event was recorded (/join relies on it — the CRM is
// the only place a join lead is stored).
export async function recordFunnelEvent(admin: Admin, ev: {
  fullName: string;
  /** may be empty: then the contact is matched by name */
  email: string;
  phone?: string | null;
  brand?: CrmBrand;
  source: string;
  form: string;
  summary: string;
  submissionId?: string;
  extra?: Record<string, unknown>;
  /** The channel the person says they came from (e.g. 'instagram'); stored as the contact's source instead of the form's. */
  contactSource?: string;
  /** IronBodyFit meal-plan form: they're a meal-plan client straight away, plan still to send */
  mealPlanClient?: boolean;
}): Promise<boolean> {
  try {
    // A retried / double-clicked submission is saved once; log it once too.
    if (ev.submissionId) {
      const { data: seen } = await admin.from('crm_activities').select('id').eq('meta->>submission_id', ev.submissionId).limit(1);
      if (seen?.length) return true;
    }
    const email = ev.email.trim().toLowerCase();
    const brand = ev.brand ?? brandForSource(ev.source);
    const rawPhone = (ev.phone ?? '').trim();
    const phone = /^[279]\d{7}$/.test(rawPhone.replace(/[\s-]/g, '')) ? `+356 ${rawPhone.replace(/[\s-]/g, '')}` : rawPhone || null;
    const typed = ev.fullName.trim().replace(/\s+/g, ' ');
    // "maria borg" → "Maria Borg"; names typed with capitals are left alone.
    const name = typed === typed.toLowerCase() ? typed.replace(/(^|[\s'-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase()) : typed;
    const cols = 'id, phone, stage, package, tags, source';
    type Match = { id: string; phone: string | null; stage: CrmStage; package: CrmContactRow['package']; tags: string[]; source: string };
    let existing: Match | null = null;
    if (email) {
      existing = (await admin.from('crm_contacts').select(cols).eq('email', email).maybeSingle()).data;
    } else {
      // No email (IronBodyFit form): match by name within the brand, then
      // by phone number (last 8 digits) for typos — but only when a first
      // name or surname also matches, since some people share a number.
      existing = (await admin.from('crm_contacts').select(cols).eq('brand', brand)
        .ilike('full_name', name.replace(/[\\%_]/g, '\\$&')).order('list_position').limit(1).maybeSingle()).data;
      const digits = (ev.phone ?? '').replace(/\D/g, '').slice(-8);
      if (!existing && digits.length === 8) {
        const words = new Set(name.toLowerCase().split(' ').filter((w) => w.length >= 3));
        const { data: withPhone } = await admin.from('crm_contacts').select(`${cols}, full_name`).eq('brand', brand).not('phone', 'is', null).order('list_position');
        existing = (withPhone || []).find((c) =>
          (c.phone ?? '').replace(/\D/g, '').slice(-8) === digits &&
          c.full_name.toLowerCase().split(/\s+/).some((w) => words.has(w))
        ) ?? null;
      }
    }

    let contactId = existing?.id;
    if (!contactId) {
      // Someone who already has a client account is a client, not a lead.
      const { data: profile } = email
        ? await admin.from('profiles').select('id, role, archived_at').ilike('email', email).maybeSingle()
        : { data: null };
      const isClient = !!profile && profile.role === 'client';
      const stage: CrmStage = isClient ? (profile!.archived_at ? 'past' : 'won') : ev.mealPlanClient ? 'won' : 'lead';
      const { data: created, error } = await admin.from('crm_contacts').insert({
        full_name: name || email || 'Unknown',
        email: email || null,
        phone,
        source: ev.contactSource ?? ev.source,
        brand,
        stage,
        client_id: isClient ? profile!.id : null,
        ...(ev.mealPlanClient && !isClient ? { package: 'meal_plan' as const, tags: ['plan-pending'] } : {}),
      }).select('id').single();
      if (error) {
        // Lost a race with a parallel submission for the same email — use theirs.
        const { data: again } = email ? await admin.from('crm_contacts').select('id').eq('email', email).maybeSingle() : { data: null };
        contactId = again?.id;
      } else {
        contactId = created.id;
      }
    } else {
      const update: Partial<CrmContactRow> = {};
      if (!existing?.phone && phone) update.phone = phone;
      // A contact whose source is just "which form they filled in" learns
      // where they really came from; a real channel already on file stays.
      if (ev.contactSource && existing && ['other', 'assessment', 'v_plan', 'join_form'].includes(existing.source)) update.source = ev.contactSource;
      // An existing lead / past contact asking for a meal plan becomes a
      // meal-plan client with the plan to send; existing 1-1 clients keep
      // their package.
      if (ev.mealPlanClient && existing && !existing.package) {
        update.package = 'meal_plan';
        update.stage = 'won';
        update.brand = 'ironbodyfit';
        update.tags = Array.from(new Set([...(existing.tags ?? []).filter((t) => t !== 'plan-sent'), 'plan-pending']));
      } else if (ev.mealPlanClient && existing?.package === 'meal_plan') {
        // Asked again: there's a new plan to send.
        update.tags = Array.from(new Set([...(existing.tags ?? []).filter((t) => t !== 'plan-sent'), 'plan-pending']));
      }
      if (Object.keys(update).length) await admin.from('crm_contacts').update(update).eq('id', contactId);
    }
    if (!contactId) return false;

    const { error } = await admin.from('crm_activities').insert({
      contact_id: contactId,
      kind: 'form',
      body: ev.summary,
      meta: { form: ev.form, submission_id: ev.submissionId ?? null, ...(ev.extra ?? {}) },
    });
    return !error;
  } catch (err) {
    console.error('crm: recordFunnelEvent failed', err);
    return false;
  }
}

// A client account was created (or restored) for this email: link the CRM
// contact and mark them won, creating the contact if needed.
export async function markContactWon(admin: Admin, ev: { email: string; fullName: string; clientId: string; restored: boolean }): Promise<void> {
  try {
    const email = ev.email.trim().toLowerCase();
    const { data: existing } = await admin.from('crm_contacts').select('id').eq('email', email).maybeSingle();
    let contactId = existing?.id;
    if (contactId) {
      await admin.from('crm_contacts').update({ stage: 'won', client_id: ev.clientId, lost_reason: null }).eq('id', contactId);
    } else {
      const { data: created } = await admin.from('crm_contacts').insert({
        full_name: ev.fullName.trim() || email, email, source: 'other', stage: 'won', client_id: ev.clientId,
      }).select('id').single();
      contactId = created?.id;
    }
    if (contactId) {
      await admin.from('crm_activities').insert({
        contact_id: contactId, kind: 'system',
        body: ev.restored ? 'Client account restored' : 'Client account created — invite sent',
        meta: { client_id: ev.clientId },
      });
    }
  } catch (err) {
    console.error('crm: markContactWon failed', err);
  }
}
