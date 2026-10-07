import { V_PLAN_SECTIONS } from '@/lib/mealPlan/vPlanQuestions';
import MealPlanInbox from '@/components/coach/MealPlanInbox';

// V Plans: meal-plan requests from Vitality's own clients via the public
// /vitality-meal-plan form — kept apart from assessments and IronBodyFit requests.
export default function VPlansPage() {
  return (
    <MealPlanInbox
      source="vitality"
      sections={V_PLAN_SECTIONS}
      title="V Plans"
      emptyText="No V Plan requests yet. Send your clients the /vitality-meal-plan link."
    />
  );
}
