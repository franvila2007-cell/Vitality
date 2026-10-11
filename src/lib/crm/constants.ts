import type { CrmActivityKind, CrmStage } from '@/lib/supabase/database.types';

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
};

export function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}`;
}
