import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { COOKIE_NAME, SESSION_HOURS, createSessionToken } from '@/lib/session';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Compare against a fixed-length buffer first so the length of a wrong
  // guess is never observable via timing, only the final result is.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: 'ADMIN_PASSWORD is not configured on the server.' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!password || !safeEqual(password, expected)) {
    // Same message either way — don't confirm whether the field was empty
    // vs. wrong, that's not information a login form should leak.
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_HOURS * 60 * 60,
    path: '/',
  });
  return res;
}
