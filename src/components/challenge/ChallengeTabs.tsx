import Link from 'next/link';

// Switch between the challenge's two coach views: intakes and weekly check-ins.
export default function ChallengeTabs({ active }: { active: 'intakes' | 'checkins' }) {
  const tab = (on: boolean) => `rounded-full px-3 py-1.5 text-xs font-medium ${on ? 'bg-brand text-white' : 'text-neutral-500 hover:text-neutral-800'}`;
  return (
    <nav className="mb-4 inline-flex items-center gap-1 rounded-full border border-border p-0.5">
      <Link href="/coach/challenge" className={tab(active === 'intakes')}>Intakes</Link>
      <Link href="/coach/challenge/check-ins" className={tab(active === 'checkins')}>Weekly check-ins</Link>
    </nav>
  );
}
