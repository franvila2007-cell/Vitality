'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Top-level switch in the coach header: the existing client area, or the CRM.
export default function CoachNav({ followUpsDue }: { followUpsDue: number }) {
  const pathname = usePathname();
  const inCrm = pathname.startsWith('/coach/crm');
  const pill = (on: boolean) =>
    `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${on ? 'bg-brand text-white' : 'text-neutral-500 hover:text-neutral-800'}`;
  return (
    <nav className="flex items-center gap-1 rounded-full border border-border p-0.5">
      <Link href="/coach" className={pill(!inCrm)}>Clients</Link>
      <Link href="/coach/crm" className={pill(inCrm)}>
        CRM
        {followUpsDue > 0 && (
          <span className={`min-w-4 rounded-full px-1 text-center text-3xs font-semibold leading-4 ${inCrm ? 'bg-white text-brand-dark' : 'bg-ibf-red text-white'}`}>{followUpsDue}</span>
        )}
      </Link>
    </nav>
  );
}
