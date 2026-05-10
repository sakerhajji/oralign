import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── Route classifications ────────────────────────────────────────────────────

/** Require a valid auth cookie to access */
const PROTECTED_PREFIXES = ['/dashboard', '/account'];

/** Redirect to /dashboard when already authenticated */
const AUTH_ONLY_PATHS = ['/login', '/signup', '/forgot-password'];

/**
 * Always accessible regardless of auth state.
 * (email verification needs to be reachable during onboarding even after login;
 *  password reset needs the token in the URL on any device)
 */
const ALWAYS_PUBLIC_PREFIXES = ['/auth/verify-email', '/reset-password', '/verify-email'];

// ─── Proxy function ───────────────────────────────────────────────────────────

export default function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Skip Next.js internals and static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get('accessToken')?.value;
  const isAuthenticated = Boolean(accessToken);

  // Always-public paths are never redirected regardless of auth state
  const isAlwaysPublic = ALWAYS_PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
  if (isAlwaysPublic) {
    return NextResponse.next();
  }

  // Guard: protected route without token → send to /login
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('from', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Guard: auth-only page when already logged in → send to /dashboard
  const isAuthOnly = AUTH_ONLY_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + '/'),
  );
  if (isAuthOnly && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
