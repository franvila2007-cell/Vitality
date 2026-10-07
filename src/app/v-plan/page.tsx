import { permanentRedirect } from 'next/navigation';

// Old name for the Vitality meal-plan form — kept so links already sent out
// still work.
export default function VPlanRedirect() {
  permanentRedirect('/vitality-meal-plan');
}
