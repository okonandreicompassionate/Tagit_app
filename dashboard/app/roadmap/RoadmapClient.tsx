'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePolling } from '@/lib/usePolling';
import { Card, ErrorBanner, SectionTitle, relativeTime } from '@/lib/ui';
import type { RoadmapItem } from '../api/roadmap/route';

const COLUMNS: { status: RoadmapItem['status']; label: string; sub: string }[] = [
  { status: 'idea', label: 'Idea', sub: 'Worth doing, not scoped yet' },
  { status: 'planned', label: 'Planned', sub: 'Scoped, not started' },
  { status: 'building', label: 'Building', sub: 'In progress right now' },
  { status: 'shipped', label: 'Shipped', sub: 'Live' },
];

const NEXT: Record<RoadmapItem['status'], RoadmapItem['status'] | null> = {
  idea: 'planned',
  planned: 'building',
  building: 'shipped',
  shipped: null,
};
const PREV: Record<RoadmapItem['status'], RoadmapItem['status'] | null> = {
  idea: null,
  planned: 'idea',
  building: 'planned',
  shipped: 'building',
};

export function RoadmapClient() {
  const { data, error, updatedAt } = usePolling<{ items: RoadmapItem[] }>('/api/roadmap', 30_000);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: number; message: string } | null>(null);

  // Per-item patches, not a full-list snapshot — each entry is dropped the
  // moment a poll's own data already reflects it (see the effect below), so
  // a concurrent edit from elsewhere and this session's own optimism never
  // permanently disagree the way a single frozen overlay would.
  const [statusPatch, setStatusPatch] = useState<Record<number, RoadmapItem['status']>>({});
  const [deleted, setDeleted] = useState<Set<number>>(new Set());
  const [justCreated, setJustCreated] = useState<RoadmapItem[]>([]);

  const baseItems = data?.items ?? [];

  // Drop any patch the latest poll already agrees with — the only way this
  // overlay can go stale is by living forever, so it isn't allowed to.
  useEffect(() => {
    if (!data) return;
    setStatusPatch((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [idStr, status] of Object.entries(prev)) {
        const id = Number(idStr);
        const real = baseItems.find((i) => i.id === id);
        if (real && real.status === status) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setDeleted((prev) => {
      const stillThere = [...prev].filter((id) => baseItems.some((i) => i.id === id));
      return stillThere.length === prev.size ? prev : new Set(stillThere);
    });
    setJustCreated((prev) => prev.filter((c) => !baseItems.some((i) => i.id === c.id)));
    // baseItems is a new array identity every poll tick by design (usePolling
    // replaces `data` wholesale) — that's exactly the signal this should run on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const items = useMemo(() => {
    const patched = baseItems
      .filter((i) => !deleted.has(i.id))
      .map((i) => (statusPatch[i.id] ? { ...i, status: statusPatch[i.id] } : i));
    return [...justCreated, ...patched];
  }, [baseItems, statusPatch, deleted, justCreated]);

  const create = async () => {
    if (title.trim().length < 1) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, detail }),
      });
      const body = await res.json();
      if (!res.ok || body.error) {
        setCreateError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setJustCreated((prev) => [body.item as RoadmapItem, ...prev]);
      setTitle('');
      setDetail('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setCreating(false);
    }
  };

  const move = async (item: RoadmapItem, status: RoadmapItem['status']) => {
    setActionError(null);
    setStatusPatch((prev) => ({ ...prev, [item.id]: status }));
    try {
      const res = await fetch(`/api/roadmap/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        // Revert — a silently-kept optimistic move is worse than a card
        // that snaps back with a reason why.
        setStatusPatch((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        setActionError({ id: item.id, message: body.error ?? `HTTP ${res.status}` });
      }
    } catch (err) {
      setStatusPatch((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setActionError({ id: item.id, message: err instanceof Error ? err.message : 'Network error' });
    }
  };

  const remove = async (item: RoadmapItem) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setActionError(null);
    setDeleted((prev) => new Set(prev).add(item.id));
    try {
      const res = await fetch(`/api/roadmap/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleted((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        setActionError({ id: item.id, message: body.error ?? `HTTP ${res.status}` });
      }
    } catch (err) {
      setDeleted((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      setActionError({ id: item.id, message: err instanceof Error ? err.message : 'Network error' });
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="mb-6 flex items-baseline justify-between">
        <p className="text-[13.5px] text-dim">
          What&apos;s coming — yours to add to, move around, and clear out. Nothing here touches
          the app; it&apos;s just a place for this to live besides a chat thread.
        </p>
        <p className="font-mono text-[11px] text-faint">Updated {relativeTime(updatedAt)}</p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <Card className="mb-8 p-5">
        <SectionTitle sub="Lands in Idea. Drag it forward as it firms up.">Add something</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Feature name"
            className="rounded-lg border border-edge bg-surfhi px-3 py-2 text-[13.5px] text-white placeholder:text-faint focus:border-snap focus:outline-none"
          />
          <input
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="A sentence or two, optional"
            className="rounded-lg border border-edge bg-surfhi px-3 py-2 text-[13.5px] text-white placeholder:text-faint focus:border-snap focus:outline-none"
          />
          <button
            onClick={() => void create()}
            disabled={creating || title.trim().length < 1}
            className="rounded-full bg-snap px-5 py-2 text-[13px] font-bold text-black disabled:opacity-40"
          >
            {creating ? 'Adding…' : 'Add'}
          </button>
        </div>
        {createError ? <p className="mt-3 text-[12.5px] text-flame">{createError}</p> : null}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const colItems = items.filter((i) => i.status === col.status);
          return (
            <div key={col.status}>
              <div className="mb-3">
                <h3 className="font-display text-[15px] font-extrabold">
                  {col.label} <span className="text-faint">({colItems.length})</span>
                </h3>
                <p className="text-[11.5px] text-faint">{col.sub}</p>
              </div>

              <div className="grid gap-2.5">
                {colItems.map((item) => (
                  <Card key={item.id} className="p-3.5">
                    <p className="text-[13.5px] font-semibold">{item.title}</p>
                    {item.detail ? <p className="mt-1 text-[12px] text-dim">{item.detail}</p> : null}
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex gap-1.5">
                        {PREV[item.status] ? (
                          <button
                            onClick={() => void move(item, PREV[item.status]!)}
                            className="rounded-full border border-edge px-2.5 py-1 text-[11px] font-bold text-dim hover:text-white"
                          >
                            ‹
                          </button>
                        ) : null}
                        {NEXT[item.status] ? (
                          <button
                            onClick={() => void move(item, NEXT[item.status]!)}
                            className="rounded-full border border-edge px-2.5 py-1 text-[11px] font-bold text-dim hover:text-white"
                          >
                            ›
                          </button>
                        ) : null}
                      </div>
                      <button
                        onClick={() => void remove(item)}
                        className="text-[11px] font-bold text-faint hover:text-flame"
                      >
                        Delete
                      </button>
                    </div>
                    {actionError?.id === item.id ? (
                      <p className="mt-2 text-[11px] text-flame">{actionError.message}</p>
                    ) : null}
                  </Card>
                ))}
                {colItems.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-edge p-4 text-center text-[12px] text-faint">
                    Nothing here
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
