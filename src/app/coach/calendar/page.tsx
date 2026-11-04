import CalendarClient from '@/components/coach/CalendarClient';

// Coach-only (role guard lives in coach/layout.tsx; the tables are coach-only via RLS too).
export const metadata = { title: 'Calendar · Vitality' };

export default function CalendarPage() {
  return <CalendarClient />;
}
