import CallsClient from '@/components/CallsClient';

export const metadata = { title: 'Calls · Vitality' };

// Role guard and nav live in (client)/layout.tsx.
export default function CallsPage() {
  return <CallsClient />;
}
