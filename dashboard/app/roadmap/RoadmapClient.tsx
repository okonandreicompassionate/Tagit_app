'use client';

import { useState } from 'react';
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
  // Optimistic local state so a move/delete/add doesn't wait on the next poll.
  const [overlay, setOverlay] = useState<RoadmapItem[] | null>(null);

  const items = overlay ?? data?.items ?? [];

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
      setOverlay([body.item as RoadmapItem, ...items]);
      setTitle('');
      setDetail('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setCreating(false);
    }
  };

  const move = async (item: RoadmapItem, status: RoadmapItem['status']) => {
    setOverlay(items.map((i) => (i.id === item.id ? { ...i, status } : i)));
    try {
      await fetch(`/api/roadmap/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch {
      // Next poll reconciles either way.
    }
  };

  const remove = async (item: RoadmapItem) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setOverlay(items.filter((i) => i.id !== item.id));
    try {
      await fetch(`/api/roadmap/${item.id}`, { method: 'DELETE' });
    } catch {
      // Next poll reconciles either way.
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
