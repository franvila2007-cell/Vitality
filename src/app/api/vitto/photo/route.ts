import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { llmAnalyzeMealPhoto } from '@/lib/vitto/llmFallback';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
// ~5MB of actual image data — base64 is ~4/3 the raw size, so this bounds
// the request body without needing to decode first.
const MAX_BASE64_LENGTH = 7_000_000;

export async function POST(req: Request) {
  const { image, mediaType } = (await req.json()) as { image?: string; mediaType?: string };
  if (!image || !mediaType) return NextResponse.json({ error: 'image and mediaType are required' }, { status: 400 });
  if (!ALLOWED_TYPES.has(mediaType)) return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
  if (image.length > MAX_BASE64_LENGTH) return NextResponse.json({ error: 'That photo is too large — try a smaller one.' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Photo logging isn't available right now — log it by typing instead." }, { status: 503 });

  const items = await llmAnalyzeMealPhoto(image, mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', apiKey);
  if (!items) return NextResponse.json({ error: "Couldn't identify any food in that photo — try a clearer shot, or log it by typing instead." }, { status: 422 });

  return NextResponse.json({ items });
}
