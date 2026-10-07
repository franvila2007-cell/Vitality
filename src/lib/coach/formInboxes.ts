import type { createClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// The three form inboxes in the coach area, in display order. Shared by the
// coach home boxes and the tab bar on each inbox page so they always agree.
export type InboxKey = 'assessments' | 'ironbodyfit' | 'vitality';

export const INBOXES: { key: InboxKey; href: string; title: string; subtitle: string; formPath: string }[] = [
  { key: 'assessments', href: '/coach/assessments', title: 'Assessments', subtitle: 'New client onboarding', formPath: '/assessment' },
  { key: 'ironbodyfit', href: '/coach/meal-plans', title: 'IronBodyFit', subtitle: 'IronBodyFit meal plans', formPath: '/ironbodyfit-meal-plans' },
  { key: 'vitality', href: '/coach/v-plans', title: 'V Plans', subtitle: 'Vitality client meal plans', formPath: '/v-plan' },
];

export type InboxCounts = Record<InboxKey, { total: number; fresh: number }>;

// `fresh` = what needs the coach's attention: meal-plan requests still marked
// New, and (assessments having no status) ones submitted in the last 7 days.
export async function getInboxCounts(supabase: ServerClient): Promise<InboxCounts> {
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const count = { count: 'exact', head: true } as const;
  const [aTotal, aWeek, iTotal, iNew, vTotal, vNew] = await Promise.all([
    supabase.from('assessments').select('id', count),
    supabase.from('assessments').select('id', count).gte('created_at', weekAgo),
    supabase.from('meal_plan_requests').select('id', count).eq('source', 'ironbodyfit'),
    supabase.from('meal_plan_requests').select('id', count).eq('source', 'ironbodyfit').eq('status', 'new'),
    supabase.from('meal_plan_requests').select('id', count).eq('source', 'vitality'),
    supabase.from('meal_plan_requests').select('id', count).eq('source', 'vitality').eq('status', 'new'),
  ]);
  return {
    assessments: { total: aTotal.count ?? 0, fresh: aWeek.count ?? 0 },
    ironbodyfit: { total: iTotal.count ?? 0, fresh: iNew.count ?? 0 },
    vitality: { total: vTotal.count ?? 0, fresh: vNew.count ?? 0 },
  };
}
