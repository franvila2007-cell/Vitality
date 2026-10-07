import type { Metadata } from 'next';
import MealPlanForm from '@/components/mealPlan/MealPlanFormLoader';

export const metadata: Metadata = {
  title: 'Vitality Meal Plan',
  description: 'Health made to work around your life, not made to be your life.',
  robots: { index: false, follow: false },
};

// Public meal-plan request form for Vitality clients — no login needed, so
// it can be sent as a link. Clients see it as "Vitality Meal Plan"; answers
// are posted to /api/v-plan and filed under V Plans at /coach/v-plans.
export default function VitalityMealPlanPage() {
  return <MealPlanForm variant="vitality" />;
}
