import { NextResponse } from 'next/server';
import { requireGodApi } from '@/lib/auth-guard';
import { hashPassword } from '@/lib/adminAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export type AdminListRow = {
  id: string;
  email: string;
  role: 'admin' | 'god';
  created_at: string;
};

export async function GET() {
  const gate = await requireGodApi();
  if ('response' in gate) return gate.response;

  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from('admins')
      .select('id,email,role,created_at')
      .order('created_at', { ascending: true })
      .returns<AdminListRow[]>();

    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ admins: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const gate = await requireGodApi();
  if ('response' in gate) return gate.response;

  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const role = body?.role === 'god' ? 'god' : 'admin';

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Enter a real email address.' }, { status: 400 });
    }
    if (password.length < 10) {
      return NextResponse.json({ error: 'Password needs to be at least 10 characters.' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data, error } = await db
      .from('admins')
      .insert({
        email,
        password_hash: await hashPassword(password),
        role,
        created_by: gate.session.adminId,
      } as never)
      .select('id,email,role,created_at')
      .single<AdminListRow>();

    if (error) {
      // Postgres unique_violation on the email column.
      if (error.code === '23505') {
        return NextResponse.json({ error: 'An admin with that email already exists.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ admin: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
