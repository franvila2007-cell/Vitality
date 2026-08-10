import { NextResponse } from 'next/server';

// Temporary diagnostic — reveals only length + first/last few characters of
// the public env vars (never the full secret) to confirm what value the
// deployed function actually sees. Delete once the auth flow is confirmed
// working.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const describe = (s: string) => ({
    length: s.length,
    first12: s.slice(0, 12),
    last6: s.slice(-6),
    hasBullet: s.includes('•'),
  });
  return NextResponse.json({ url: describe(url), key: describe(key) });
}
// recheck 1786362744
