import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { COOKIE_NAME, verifySessionToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Who's signed in, for the nav to decide whether to show god-only tabs —
 * without every page having to thread the session down as a prop. */
export async function GET() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  return NextResponse.json({ email: session.email, role: session.role });
}
