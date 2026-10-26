import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PHOTO_BUCKET, PHOTO_SLOTS } from '@/lib/challenge/checkin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };

// Public: one-off signed upload links for a check-in's progress photos, so the
// browser uploads straight into the private bucket (no big request through
// the server). Paths are <submissionId>/<front|side|back>.<ext>; the submit
// route only accepts paths of that shape for the same submission.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { submissionId?: unknown; files?: unknown } | null;
  const submissionId = typeof body?.submissionId === 'string' ? body.submissionId : '';
  const files = Array.isArray(body?.files) ? (body.files as { slot?: unknown; type?: unknown }[]) : [];
  if (!UUID_RE.test(submissionId) || files.length === 0 || files.length > PHOTO_SLOTS.length) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const admin = createAdminClient();
  const uploads = [];
  for (const f of files) {
    const slot = PHOTO_SLOTS.find((s) => s === f.slot);
    const ext = typeof f.type === 'string' ? EXT[f.type] : undefined;
    if (!slot || !ext) return NextResponse.json({ error: 'Please upload JPG, PNG or HEIC photos.' }, { status: 400 });
    const path = `${submissionId.toLowerCase()}/${slot}.${ext}`;
    const { data, error } = await admin.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) {
      console.error('challenge photo upload url failed', error);
      return NextResponse.json({ error: "We couldn't prepare your photo upload. Please try again." }, { status: 500 });
    }
    uploads.push({ slot, path, token: data.token });
  }
  return NextResponse.json({ uploads });
}
