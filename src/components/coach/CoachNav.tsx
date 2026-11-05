'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Top-level switch in the coach header: the existing client area, the CRM, the
// calendar, the Foods page (teach Vitto brands and products), or the Links page
// (every form the coach shares).
export default function CoachNav({ followUpsDue }: { followUpsDue: number }) {
  const pathname = usePathname();
  const inCrm = pathname.startsWith('/coach/crm');
  const inFoods = pathname.startsWith('/coach/foods');
  const inCalendar = pathname.startsWith('/coach/calendar');
  const inLinks = pathname.startsWith('/coach/links');
  const pill = (on: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium sm:flex-none sm:px-3 ${on ? 'bg-brand text-white' : 'text-neutral-500 hover:text-neutral-800'}`;
  return (
    <nav className="order-last flex w-full items-center gap-1 rounded-full border border-border p-0.5 sm:order-none sm:w-auto">
      <Link href="/coach" className={pill(!inCrm && !inFoods && !inCalendar && !inLinks)}>Clients</Link>
      <Link href="/coach/crm" className={pill(inCrm)}>
        CRM
        {followUpsDue > 0 && (
          <span className={`min-w-4 rounded-full px-1 text-center text-3xs font-semibold leading-4 ${inCrm ? 'bg-white text-brand-dark' : 'bg-ibf-red text-white'}`}>{followUpsDue}</span>
        )}
      </Link>
      <Link href="/coach/calendar" className={pill(inCalendar)}>Calendar</Link>
      <Link href="/coach/foods" className={pill(inFoods)}>Foods</Link>
      <Link href="/coach/links" className={pill(inLinks)}>Links</Link>
    </nav>
  );
}
