import { NextResponse } from 'next/server';
import { requireGodApi } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const STATUSES = ['open', 'reviewing', 'actioned', 'dismissed'] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireGodApi();
  if ('response' in gate) return gate.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    const { error } = await db.from('reports').update({ status } as never).eq('id', Number(id));
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
