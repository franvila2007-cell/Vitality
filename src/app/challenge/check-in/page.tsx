import type { Metadata } from 'next';
import CheckinForm from '@/components/challenge/CheckinLoader';

export const metadata: Metadata = {
  title: 'Weekly check-in · Vitality 8-Week Challenge',
  description: 'Your weekly 8-Week Challenge check-in.',
  robots: { index: false },
  openGraph: { title: 'Weekly check-in · Vitality 8-Week Challenge', description: 'Your weekly check-in. Takes about 3 minutes.', siteName: 'Vitality' },
};

// Public weekly check-in: one shared link for every challenge member; the
// form recognises each person by email (then phone).
export default function ChallengeCheckinPage() {
  return <CheckinForm />;
}
