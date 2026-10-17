import type { Metadata } from 'next';
import ChallengeIntakeForm from '@/components/challenge/ChallengeIntakeLoader';

export const metadata: Metadata = {
  title: 'Vitality 8-Week Challenge',
  description: "You didn't wait for 2027. Tell us about you so we can build your 8 weeks around you.",
  robots: { index: false },
};

// Public intake for the 8-Week Challenge — the Stripe Payment Link's
// "after payment" redirect. The WhatsApp community invite comes from the
// CHALLENGE_WHATSAPP_URL env var (button hidden until it's set).
export default function ChallengeIntakePage() {
  return <ChallengeIntakeForm whatsappUrl={process.env.CHALLENGE_WHATSAPP_URL ?? ''} />;
}
