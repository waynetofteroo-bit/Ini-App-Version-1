import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { createServerClient } from '@supabase/ssr';

const PROTECTED = [
  '/dashboard',
  '/session',
  '/progress',
  '/unit',
  '/courses',
  '/onboarding/add',
  '/curriculum',
];

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    return NextResponse.redirect(loginUrl);
  }

  if (isProtected && user) {
    // Check if the user has any enrolled courses
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      }
    );

    const { count } = await supabase
      .from('user_courses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // New user — redirect to onboarding (except if already going there)
    if ((count ?? 0) === 0 && !pathname.startsWith('/onboarding')) {
      const onboardUrl = request.nextUrl.clone();
      onboardUrl.pathname = '/onboarding';
      return NextResponse.redirect(onboardUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
};
