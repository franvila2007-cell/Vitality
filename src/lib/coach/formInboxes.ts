import type { createClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// The form inboxes in the coach area, in display order. Shared by the
// coach home boxes and the tab bar on each inbox page so they always agree.
// 'challenge' is temporary (8-Week Challenge, Oct 2026) — remove with its pages.
export type InboxKey = 'assessments' | 'ironbodyfit' | 'vitality' | 'challenge';

export const INBOXES: { key: InboxKey; href: string; title: string; subtitle: string; formPath: string }[] = [
  { key: 'assessments', href: '/coach/assessments', title: 'Assessments', subtitle: 'New client onboarding', formPath: '/assessment' },
  { key: 'ironbodyfit', href: '/coach/meal-plans', title: 'IronBodyFit', subtitle: 'IronBodyFit meal plans', formPath: '/ironbodyfit-meal-plans' },
  { key: 'vitality', href: '/coach/v-plans', title: 'V Plans', subtitle: 'Vitality client meal plans', formPath: '/vitality-meal-plan' },
  { key: 'challenge', href: '/coach/challenge', title: '8-Week Challenge', subtitle: 'Challenge intakes', formPath: '/challenge/intake' },
];

export type InboxCounts = Record<InboxKey, { total: number; fresh: number }>;

// `fresh` = what needs the coach's attention: meal-plan requests still marked
// New, (assessments having no status) ones submitted in the last 7 days, and
// challenge intakes with a health flag.
export async function getInboxCounts(supabase: ServerClient): Promise<InboxCounts> {
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const count = { count: 'exact', head: true } as const;
  const [aTotal, aWeek, iTotal, iNew, vTotal, vNew, cTotal, cFlag] = await Promise.all([
    supabase.from('assessments').select('id', count),
    supabase.from('assessments').select('id', count).gte('created_at', weekAgo),
    supabase.from('meal_plan_requests').select('id', count).eq('source', 'ironbodyfit'),
    supabase.from('meal_plan_requests').select('id', count).eq('source', 'ironbodyfit').eq('status', 'new'),
    supabase.from('meal_plan_requests').select('id', count).eq('source', 'vitality'),
    supabase.from('meal_plan_requests').select('id', count).eq('source', 'vitality').eq('status', 'new'),
    supabase.from('challenge_intakes').select('id', count),
    supabase.from('challenge_intakes').select('id', count).eq('health_flag', true),
  ]);
  return {
    assessments: { total: aTotal.count ?? 0, fresh: aWeek.count ?? 0 },
    ironbodyfit: { total: iTotal.count ?? 0, fresh: iNew.count ?? 0 },
    vitality: { total: vTotal.count ?? 0, fresh: vNew.count ?? 0 },
    challenge: { total: cTotal.count ?? 0, fresh: cFlag.count ?? 0 },
  };
}
