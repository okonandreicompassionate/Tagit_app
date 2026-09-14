'use client';

import { useState } from 'react';
import { usePolling } from '@/lib/usePolling';
import { Card, ErrorBanner, Pill, SectionTitle, relativeTime } from '@/lib/ui';
import type { ModerationReport } from '../api/moderation/route';

const REASON_LABELS: Record<string, string> = {
  harassment: 'Harassment or bullying',
  impersonation: 'Impersonation',
  underage: 'Seems under 13',
  spam: 'Spam or scam',
  inappropriate: 'Inappropriate photo or name',
  safety: 'Made them feel unsafe',
  other: 'Something else',
};

const STATUSES = ['open', 'reviewing', 'actioned', 'dismissed'] as const;

export function ModerationClient() {
  const { data, error, updatedAt } = usePolling<{ reports: ModerationReport[] }>('/api/moderation', 20_000);
  const [statusPatch, setStatusPatch] = useState<Record<number, ModerationReport['status']>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<{ id: number; message: string } | null>(null);

  const reports = (data?.reports ?? []).map((r) =>
    statusPatch[r.id] ? { ...r, status: statusPatch[r.id] } : r
  );
  const openCount = reports.filter((r) => r.status === 'open' || r.status === 'reviewing').length;

  const setStatus = async (report: ModerationReport, status: ModerationReport['status']) => {
    setActionError(null);
    setSavingId(report.id);
    const prev = report.status;
    setStatusPatch((p) => ({ ...p, [report.id]: status }));
    try {
      const res = await fetch(`/api/moderation/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatusPatch((p) => ({ ...p, [report.id]: prev }));
        setActionError({ id: report.id, message: body.error ?? `HTTP ${res.status}` });
      }
    } catch (err) {
      setStatusPatch((p) => ({ ...p, [report.id]: prev }));
      setActionError({ id: report.id, message: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
      <div className="mb-6 flex items-baseline justify-between">
        <p className="text-[13.5px] text-dim">
          Nobody's read these before — `reports` has no client-readable policy at all, this is the
          first thing that's ever queried it besides the app writing to it.
        </p>
        <p className="font-mono text-[11px] text-faint">Updated {relativeTime(updatedAt)}</p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="mb-5 flex gap-2">
        <Pill tone={openCount > 0 ? 'flame' : 'good'}>
          {openCount} open or reviewing
        </Pill>
        <Pill>{reports.length} total</Pill>
      </div>

      <div className="grid gap-3">
        {reports.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-bold">{REASON_LABELS[r.reason] ?? r.reason}</span>
                  <Pill
                    tone={
                      r.status === 'open'
                        ? 'flame'
                        : r.status === 'reviewing'
                          ? 'warn'
                          : r.status === 'actioned'
                            ? 'snap'
                            : 'default'
                    }
                  >
                    {r.status}
                  </Pill>
                </div>
                <p className="text-[12.5px] text-dim">
                  {r.target_card_name ? (
                    <>Reported: <span className="text-white">{r.target_card_name}</span></>
                  ) : r.target_event_name ? (
                    <>Reported event: <span className="text-white">{r.target_event_name}</span></>
                  ) : (
                    'Target no longer exists'
                  )}
                  {r.reporter_name ? <> · by {r.reporter_name}</> : ' · reporter account deleted'}
                  {' · '}
                  {relativeTime(new Date(r.created_at).getTime())}
                </p>
                {r.detail ? <p className="mt-1 max-w-[60ch] text-[13px] text-dim">{r.detail}</p> : null}
              </div>

              <select
                value={r.status}
                disabled={savingId === r.id}
                onChange={(e) => void setStatus(r, e.target.value as ModerationReport['status'])}
                className="rounded-lg border border-edge bg-surfhi px-3 py-1.5 text-[12.5px] text-white focus:border-snap focus:outline-none disabled:opacity-40"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {actionError?.id === r.id ? (
              <p className="mt-2 text-[11px] text-flame">{actionError.message}</p>
            ) : null}
          </Card>
        ))}
        {data && reports.length === 0 ? (
          <p className="rounded-xl border border-dashed border-edge p-6 text-center text-[13px] text-faint">
            No reports filed yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
