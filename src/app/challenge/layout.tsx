import type { Viewport } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const viewport: Viewport = { themeColor: '#D6F5EE' };

// Temporary 8-Week Challenge pages: Vitality's Inter type on the mint page.
export default function ChallengeLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${inter.className} flex-1 bg-[#D6F5EE]`}>{children}</div>;
}
