import type { Metadata } from 'next';
import MealPlanForm from '@/components/mealPlan/MealPlanFormLoader';

export const metadata: Metadata = {
  title: 'V Plans · Vitality',
  description: 'Your personal Vitality meal plan.',
  robots: { index: false, follow: false },
};

// Public V Plan (meal plan) request form for Vitality clients — no login
// needed, so it can be sent as a link. Answers are posted to /api/v-plan and
// read back at /coach/v-plans.
export default function VPlanPage() {
  return <MealPlanForm variant="vitality" />;
}
