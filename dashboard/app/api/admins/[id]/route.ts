import { NextResponse } from 'next/server';
import { requireGodApi } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireGodApi();
  if ('response' in gate) return gate.response;

  const { id } = await params;
  if (id === gate.session.adminId) {
    return NextResponse.json({ error: "Can't remove your own account while signed in as it." }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    const { error } = await db.from('admins').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
