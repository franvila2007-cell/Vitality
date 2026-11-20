import TrainingClient from '@/components/training/TrainingClient';

export const metadata = { title: 'Training · Vitality' };

// Auth/role guard and <AppNav/> live in (client)/layout.tsx.
export default function TrainingPage() {
  return <TrainingClient />;
}
