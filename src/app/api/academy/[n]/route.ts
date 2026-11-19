import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { academyPath, hasAcademyAccess, isAcademyCourse } from '@/lib/academy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Opens one Vitality Academy course: checks the signed-in client has the
// Academy, then redirects to a signed link to the PDF that expires in 10 minutes,
// so a copied link can't be passed around.
export async function GET(req: Request, { params }: { params: Promise<{ n: string }> }) {
  const n = Number((await params).n);
  if (!Number.isInteger(n) || !isAcademyCourse(n)) return new NextResponse('Not found', { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const admin = createAdminClient();
  if (!(await hasAcademyAccess(admin, user.id))) return new NextResponse('The Vitality Academy is part of 1-1 coaching.', { status: 403 });

  const { data, error } = await admin.storage.from('academy').createSignedUrl(academyPath(n), 600);
  if (error || !data) return new NextResponse('Course not available right now.', { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
