import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { DUMMY_HASH, verifyPassword } from '@/lib/adminAuth';
import { COOKIE_NAME, SESSION_HOURS, createSessionToken, type AdminRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

type AdminRow = { id: string; email: string; password_hash: string; role: AdminRole };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json({ error: 'Enter an email and password.' }, { status: 401 });
    }

    const db = supabaseAdmin();
    const { data, error } = await db
      .from('admins')
      .select('id,email,password_hash,role')
      .eq('email', email)
      .maybeSingle<AdminRow>();

    if (error) return NextResponse.json({ error: error.message }, { status: 502 });

    // Runs a real PBKDF2 computation either way, against a dummy hash when
    // the email doesn't exist — otherwise "no such account" responds
    // measurably faster than "wrong password", which is exactly the kind
    // of leak a login form shouldn't have.
    const ok = data
      ? await verifyPassword(password, data.password_hash)
      : await verifyPassword(password, DUMMY_HASH);

    if (!data || !ok) {
      // Same message either way — don't confirm which part was wrong.
      return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true, role: data.role });
    res.cookies.set(
      COOKIE_NAME,
      await createSessionToken({ id: data.id, email: data.email, role: data.role }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_HOURS * 60 * 60,
        path: '/',
      }
    );
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
