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

  // Skip Next.js internals and static assets. html|txt|xml are here for the
  // files crawlers fetch straight off the site root — public/google*.html
  // (Search Console ownership proof), robots.txt, sitemap.xml. None of them
  // is ever auth-gated, and running the cookie logic over them only creates
  // a way to break verification by accident later.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|html|txt|xml)$/.test(pathname)
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

  // Guard: protected route without token → send to /login. Match on segment
  // boundaries (like the auth-only / always-public checks) so a public page
  // that merely shares a prefix — e.g. /accountability — is never gated now
  // that public pages live at the site root instead of under /patient.
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
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
