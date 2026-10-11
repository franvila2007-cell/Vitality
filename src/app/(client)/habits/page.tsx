import HabitsClient from '@/components/habits/HabitsClient';

// Auth/role guard and <AppNav/> live in (client)/layout.tsx. Client-rendered
// so "today" is the client's own local day, same as the Today tab.
export default function HabitsPage() {
  return <HabitsClient />;
}
