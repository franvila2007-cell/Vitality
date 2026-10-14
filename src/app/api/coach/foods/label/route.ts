import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { llmReadNutritionLabel } from '@/lib/vitto/llmFallback';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BASE64_LENGTH = 7_000_000;

// Coach-only: read a product's name and nutrition table from a photo of the
// package, to prefill the Teach Vitto form.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'coach') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { image, mediaType } = (await req.json().catch(() => ({}))) as { image?: string; mediaType?: string };
  if (!image || !mediaType || !ALLOWED_TYPES.has(mediaType)) return NextResponse.json({ error: 'Send a JPEG, PNG or WebP photo.' }, { status: 400 });
  if (image.length > MAX_BASE64_LENGTH) return NextResponse.json({ error: 'That photo is too large — try a smaller one.' }, { status: 400 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Label reading isn't available right now — type the values in instead." }, { status: 503 });

  const reading = await llmReadNutritionLabel(image, mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', apiKey);
  if (!reading) return NextResponse.json({ error: "Couldn't read that photo — try a sharper, closer shot of the nutrition table." }, { status: 422 });
  return NextResponse.json({ reading });
}
