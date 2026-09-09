import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { RoadmapItem } from '../route';

export const dynamic = 'force-dynamic';

const STATUSES: RoadmapItem['status'][] = ['idea', 'planned', 'building', 'shipped'];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const patch: Partial<Pick<RoadmapItem, 'title' | 'detail' | 'status'>> = {};

    if (typeof body.status === 'string') {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (typeof body.title === 'string') patch.title = body.title.trim();
    if (typeof body.detail === 'string') patch.detail = body.detail.trim() || null;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const db = supabaseAdmin();
    // Same escape hatch as the two insert() calls elsewhere in this file's
    // siblings — see api/accounts/route.ts POST.
    const { data, error } = await db
      .from('roadmap_items')
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq('id', Number(id))
      .select('*')
      .single<RoadmapItem>();

    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ item: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = supabaseAdmin();
    const { error } = await db.from('roadmap_items').delete().eq('id', Number(id));
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
