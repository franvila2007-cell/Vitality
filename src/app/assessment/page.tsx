import type { Metadata } from 'next';
import AssessmentForm from '@/components/assessment/AssessmentFormLoader';

export const metadata: Metadata = {
  title: 'Onboarding Assessment · Vitality 1-1 Coaching',
  description: "Let's build your roadmap.",
  robots: { index: false, follow: false },
};

// Public onboarding form sent to new 1-1 clients — no account needed.
// Answers are posted to /api/assessment and read back at /coach/assessments.
export default function AssessmentPage() {
  return <AssessmentForm />;
}
