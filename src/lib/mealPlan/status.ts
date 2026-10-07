import type { MealPlanStatus } from '@/lib/supabase/database.types';

// Lives outside MealPlanStatusPicker ('use client') on purpose: a server
// component importing a plain object from a client module only gets a
// client reference, not the object — which crashed /coach/meal-plans as
// soon as a request existed.
export const MEAL_PLAN_STATUS_META: Record<MealPlanStatus, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-ibf-red-light text-ibf-red border-ibf-red/20' },
  in_progress: { label: 'In progress', className: 'bg-status-warn-bg text-status-warn-text border-status-warn/30' },
  sent: { label: 'Plan sent', className: 'bg-status-good-bg text-status-good-text border-status-good/30' },
};

export const MEAL_PLAN_STATUSES: MealPlanStatus[] = ['new', 'in_progress', 'sent'];
