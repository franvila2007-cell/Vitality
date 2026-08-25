import TodayClient from '@/components/TodayClient';

// Auth/role guard and <AppNav/> now live in (client)/layout.tsx — this page
// is just its content.
export default function Home() {
  return <TodayClient />;
}
