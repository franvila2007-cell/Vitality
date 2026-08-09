import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refreshes the Supabase session cookie on every request (required by
// @supabase/ssr) and gates the two route groups by role: signed-out users
// get bounced to /login, clients can't reach /coach, and a client hitting
// /coach (or vice versa) gets redirected to their own home instead of a 403 —
// there's no public sign-up page, so anyone with a session is either the one
// coach account or one of Francesco's invited clients.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  // /auth/* (invite/magic-link callback + set-password) must stay reachable
  // both signed-out (callback exchanges the link for a session) and
  // signed-in (set-password runs right after that exchange) — only /login
  // itself should bounce an already-signed-in user away.
  const isPublicRoute = path.startsWith('/login') || path.startsWith('/auth');
  const isLoginRoute = path.startsWith('/login');
  const isCoachRoute = path.startsWith('/coach');

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (user && isCoachRoute) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'coach') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
