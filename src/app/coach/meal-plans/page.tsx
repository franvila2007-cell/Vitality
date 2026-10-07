import { MEAL_PLAN_SECTIONS } from '@/lib/mealPlan/questions';
import MealPlanInbox from '@/components/coach/MealPlanInbox';

// IronBodyFit meal-plan requests from the public /ironbodyfit-meal-plans
// form — kept apart from assessments and V Plans.
export default function MealPlansPage() {
  return (
    <MealPlanInbox
      source="ironbodyfit"
      sections={MEAL_PLAN_SECTIONS}
      title="IronBodyFit Meal Plans"
      emptyText="No requests yet. Share the /ironbodyfit-meal-plans link with IronBodyFit members."
    />
  );
}
