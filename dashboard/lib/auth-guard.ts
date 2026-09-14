import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { COOKIE_NAME, verifySessionToken, type AdminSession } from './session';

/** Call at the top of every protected Server Component. Redirects if not
 * signed in; returns the session (id/email/role) for pages that need it. */
export async function requireAdmin(): Promise<AdminSession> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session) redirect('/login');
  return session;
}

/** Same as requireAdmin, plus the 'god' role — for admin-only tooling
 * (inviting new admins, the moderation queue). Redirects to the Overview
 * rather than a bare 403: a regular admin hitting this isn't an attack,
 * just a bookmark or a typed URL, and the softest correct response is
 * "here's what you can actually see." */
export async function requireGod(): Promise<AdminSession> {
  const session = await requireAdmin();
  if (session.role !== 'god') redirect('/');
  return session;
}

/**
 * The Route Handler equivalent of requireGod() — a redirect makes no sense
 * as the response to a fetch() call, so this returns either the session or
 * a ready-to-return NextResponse (401/403) instead of throwing/redirecting.
 * Middleware already guarantees SOME valid session reached this route at
 * all (it gates every /api/* path except login); this is the role check on
 * top of that, same belt-and-braces reasoning as requireAdmin() re-checking
 * what middleware already checked.
 */
export async function requireGodApi(): Promise<{ session: AdminSession } | { response: NextResponse }> {
  const store = await cookies();
  const session = await verifySessionToken(store.get(COOKIE_NAME)?.value);
  if (!session) {
    return { response: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) };
  }
  if (session.role !== 'god') {
    return { response: NextResponse.json({ error: 'God-only.' }, { status: 403 }) };
  }
  return { session };
}
