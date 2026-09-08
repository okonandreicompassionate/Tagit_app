import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, verifySessionToken } from './lib/session';

/**
 * Gate at the edge, before any page or API route runs. Belt-and-braces with
 * `requireAdmin()` in each Server Component: middleware stops the request
 * early, the per-page check keeps working even if a route is ever restructured
 * and someone forgets to re-add it to this matcher.
 */
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (await verifySessionToken(token)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('from', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page itself, its API route, and Next's own
  // static/internal assets.
  matcher: ['/((?!login|api/auth/login|_next/static|_next/image|favicon.ico).*)'],
};
