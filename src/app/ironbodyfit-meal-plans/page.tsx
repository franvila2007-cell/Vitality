import type { Metadata } from 'next';
import MealPlanForm from '@/components/mealPlan/MealPlanFormLoader';

export const metadata: Metadata = {
  title: 'IronBodyFit Meal Plans · Powered by Vitality',
  description: 'A form created by Vitality Malta for IronBodyFit members.',
  robots: { index: false, follow: false },
};

// Public meal-plan request form for IronBodyFit members — no account needed.
// Answers are posted to /api/meal-plan and read back at /coach/meal-plans.
export default function MealPlanPage() {
  return <MealPlanForm variant="ironbodyfit" />;
}
