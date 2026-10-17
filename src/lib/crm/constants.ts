import type { CrmActivityKind, CrmBrand, CrmPackage, CrmStage } from '@/lib/supabase/database.types';

// Pipeline stages in order. The first four are the open funnel; won / lost /
// past are where a contact ends up.
export const STAGES: { key: CrmStage; label: string; short: string; className: string; dot: string }[] = [
  { key: 'lead', label: 'New lead', short: 'Lead', className: 'bg-ibf-red-light text-ibf-red border-ibf-red/20', dot: 'bg-ibf-red' },
  { key: 'contacted', label: 'Contacted', short: 'Contacted', className: 'bg-[#e6f4fb] text-[#2a8fbf] border-[#2a8fbf]/20', dot: 'bg-[#2a8fbf]' },
  { key: 'consult', label: 'Consultation', short: 'Consult', className: 'bg-status-warn-bg text-status-warn-text border-status-warn/30', dot: 'bg-status-warn' },
  { key: 'proposal', label: 'Proposal sent', short: 'Proposal', className: 'bg-[#f1ecfd] text-[#6b46c1] border-[#6b46c1]/20', dot: 'bg-[#6b46c1]' },
  { key: 'won', label: 'Client', short: 'Client', className: 'bg-status-good-bg text-status-good-text border-status-good/30', dot: 'bg-status-good' },
  { key: 'lost', label: 'Lost', short: 'Lost', className: 'bg-neutral-100 text-neutral-500 border-neutral-200', dot: 'bg-neutral-400' },
  { key: 'past', label: 'Past client', short: 'Past', className: 'bg-neutral-100 text-neutral-600 border-neutral-200', dot: 'bg-neutral-500' },
];
export const STAGE_META = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<CrmStage, (typeof STAGES)[number]>;
export const OPEN_STAGES: CrmStage[] = ['lead', 'contacted', 'consult', 'proposal'];

// Where contacts come from. Form funnels set these automatically; the rest
// are picked when adding a contact by hand (or via /join?src=…).
export const SOURCES: { key: string; label: string; emoji: string }[] = [
  { key: 'instagram', label: 'Instagram', emoji: '📸' },
  { key: 'tiktok', label: 'TikTok', emoji: '🎵' },
  { key: 'facebook', label: 'Facebook', emoji: '👍' },
  { key: 'referral', label: 'Referral', emoji: '🤝' },
  { key: 'website', label: 'Website', emoji: '🌐' },
  { key: 'join_form', label: 'Join form', emoji: '📝' },
  { key: 'assessment', label: 'Assessment form', emoji: '📋' },
  { key: 'ironbodyfit', label: 'IronBodyFit', emoji: '🛡️' },
  { key: 'v_plan', label: 'Vitality Meal Plan', emoji: '🥗' },
  { key: 'walk_in', label: 'Walk-in / event', emoji: '🚶' },
  { key: 'challenge', label: '8-Week Challenge', emoji: '🏁' },
  { key: 'existing_client', label: 'Existing client', emoji: '⭐' },
  { key: 'other', label: 'Other', emoji: '•' },
];
export const SOURCE_META = Object.fromEntries(SOURCES.map((s) => [s.key, s])) as Record<string, (typeof SOURCES)[number]>;
export function sourceLabel(key: string) { return SOURCE_META[key]?.label ?? key; }

export const ACTIVITY_META: Record<CrmActivityKind, { label: string; emoji: string }> = {
  note: { label: 'Note', emoji: '📝' },
  call: { label: 'Call', emoji: '📞' },
  message: { label: 'Message', emoji: '💬' },
  meeting: { label: 'Meeting', emoji: '🤝' },
  email: { label: 'Email', emoji: '✉️' },
  stage: { label: 'Stage', emoji: '➡️' },
  form: { label: 'Form', emoji: '📋' },
  system: { label: 'Update', emoji: '⚙️' },
};
export const LOGGABLE_KINDS: CrmActivityKind[] = ['note', 'call', 'message', 'meeting', 'email'];

// Coach inbox each form funnel lives in, for "open submission" links.
export const FORM_INBOX: Record<string, { label: string; href: string }> = {
  assessment: { label: 'Assessments', href: '/coach/assessments' },
  ironbodyfit: { label: 'IronBodyFit', href: '/coach/meal-plans' },
  v_plan: { label: 'V Plans', href: '/coach/v-plans' },
  join: { label: 'Join form', href: '/coach/crm/contacts' },
  challenge: { label: '8-Week Challenge', href: '/coach/challenge' },
};

export function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}`;
}

// Which business a contact belongs to. Vitality is listed first everywhere;
// IronBodyFit carries its red so the two are told apart at a glance.
export const BRANDS: { key: CrmBrand; label: string; stripe: string; chip: string; logo: string }[] = [
  { key: 'vitality', label: 'Vitality', stripe: 'border-l-brand', chip: 'bg-brand-light text-brand-dark', logo: '/vitality-logo.png' },
  { key: 'ironbodyfit', label: 'IronBodyFit', stripe: 'border-l-ibf-red', chip: 'bg-ibf-red-light text-ibf-red', logo: '/ironbodyfit-logo.png' },
];
export const BRAND_META = Object.fromEntries(BRANDS.map((b) => [b.key, b])) as Record<CrmBrand, (typeof BRANDS)[number]>;
export const brandOrder = (b: CrmBrand) => (b === 'vitality' ? 0 : 1);
export const brandForSource = (source: string): CrmBrand => (source === 'ironbodyfit' ? 'ironbodyfit' : 'vitality');

// What a client can buy: 1-1 coaching (3-month offer, 6 months, 1 year) or a
// one-off meal plan. A meal plan's business (Vitality / IronBodyFit) is the
// contact's brand.
export const PACKAGES: { key: CrmPackage; label: string; short: string; months: number | null; kind: 'coaching' | 'meal_plan'; note?: string; defaultPrice?: number }[] = [
  { key: '3_months', label: '3 months', short: '3 mo', months: 3, kind: 'coaching', note: 'Offer' },
  { key: '6_months', label: '6 months', short: '6 mo', months: 6, kind: 'coaching' },
  { key: '12_months', label: '1 year', short: '1 yr', months: 12, kind: 'coaching' },
  { key: 'meal_plan', label: 'Meal plan', short: 'Meal plan', months: null, kind: 'meal_plan', defaultPrice: 69.99 },
];
export const PACKAGE_META = Object.fromEntries(PACKAGES.map((p) => [p.key, p])) as Record<CrmPackage, (typeof PACKAGES)[number]>;

// Last day a coaching package covers (start + N months, minus a day). Meal
// plans are one-off, so they have no end.
export function packageEnd(start: string, pkg: CrmPackage): string | null {
  const months = PACKAGE_META[pkg].months;
  if (!months) return null;
  const [y, m, d] = start.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, d));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

// What kind of client someone is. Anyone with an app account counts as 1-1
// coaching even before their package is recorded.
export type ClientType = 'coaching' | 'vitality_meal_plan' | 'ibf_meal_plan';
export const CLIENT_TYPES: { key: ClientType; label: string; chip: string }[] = [
  { key: 'coaching', label: '1-1 Coaching', chip: 'bg-brand-light text-brand-dark' },
  { key: 'vitality_meal_plan', label: 'Vitality Meal Plan', chip: 'bg-[#e6f4fb] text-[#2a8fbf]' },
  { key: 'ibf_meal_plan', label: 'IronBodyFit Meal Plan', chip: 'bg-ibf-red-light text-ibf-red' },
];
export const CLIENT_TYPE_META = Object.fromEntries(CLIENT_TYPES.map((t) => [t.key, t])) as Record<ClientType, (typeof CLIENT_TYPES)[number]>;
export function clientType(c: { package: CrmPackage | null; brand: CrmBrand; client_id: string | null; stage: CrmStage }): ClientType | null {
  if (c.package === 'meal_plan') return c.brand === 'ironbodyfit' ? 'ibf_meal_plan' : 'vitality_meal_plan';
  if (c.package || c.client_id) return 'coaching';
  return null;
}

// IronBodyFit meal plans are free for some members and €10 for others — the
// coach flips a switch per client (CrmIbfPaid). The payment it creates carries
// this note so switching it off removes exactly that payment and nothing else.
export const IBF_MEAL_PLAN_PRICE = 10;
export const IBF_PLAN_NOTE = 'IronBodyFit meal plan';

export const PAYMENT_METHODS = ['Cash', 'Card', 'Bank transfer', 'Revolut', 'Other'];
