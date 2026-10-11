import type { Metadata } from 'next';
import JoinForm from '@/components/join/JoinForm';

export const metadata: Metadata = {
  title: 'Start with Vitality',
  description: 'Health made to work around your life, not made to be your life.',
};

// Public lead form. Share with a source tag so the CRM knows where each lead
// came from, e.g. /join?src=instagram, /join?src=tiktok, /join?src=referral.
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  const { src } = await searchParams;
  return <JoinForm src={typeof src === 'string' ? src.slice(0, 40) : ''} />;
}
