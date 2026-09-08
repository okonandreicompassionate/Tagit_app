'use client';

import { useMemo, useRef, useState } from 'react';
import { usePolling } from '@/lib/usePolling';
import { Card, ErrorBanner, Pill, SectionTitle, StatTile, UsageBar, relativeTime } from '@/lib/ui';

type TableSize = { table_name: string; total_bytes: number; table_bytes: number; index_bytes: number };
type SlowQuery = { query: string; calls: number; avg_ms: number; total_ms: number };

type DbStats = {
  database_bytes: number;
  active_connections: number;
  max_connections: number;
  table_sizes: TableSize[];
  row_counts: Record<string, number>;
  slow_queries: SlowQuery[] | null;
  pg_stat_statements_enabled: boolean;
  measured_at: string;
};

type Ping = { ok: boolean; ms: number; error?: string };

type LimitsPayload = {
  plan: string;
  planLabel: string;
  databaseBytes: number;
  storageBytes: number;
  realtimeConcurrent: number;
  monthlyActiveUsers: number;
};

function formatBytes(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 ? 2 : 1)} ${units[i]}`;
}

function pct(used: number, ceiling: number): number {
  if (!Number.isFinite(ceiling) || ceiling <= 0) return 0;
  return Math.min(100, Math.max(0, (used / ceiling) * 100));
}

/** A small hand-rolled sparkline — no charting library for eight points. */
function Sparkline({ values, width = 220, height = 44 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) {
    return <div style={{ width, height }} className="grid place-items-center text-[11px] text-faint">Collecting…</div>;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(' ');
  const last = values[values.length - 1];
  const lastY = height - ((last - min) / range) * height;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline points={points} fill="none" stroke="#fffc00" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={lastY} r={3} fill="#fffc00" />
    </svg>
  );
}

export function DatabaseClient({ limits }: { limits: LimitsPayload }) {
  const db = usePolling<DbStats>('/api/metrics/db', 30_000);
  const ping = usePolling<Ping>('/api/metrics/ping', 5_000);

  const history = useRef<number[]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  useMemo(() => {
    if (ping.data?.ok) {
      history.current = [...history.current, ping.data.ms].slice(-24);
      setHistoryTick((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ping.data]);
  void historyTick;

  const avgPing =
    history.current.length > 0
      ? history.current.reduce((a, b) => a + b, 0) / history.current.length
      : null;

  const usedBytes = db.data?.database_bytes ?? 0;
  const dbPct = pct(usedBytes, limits.databaseBytes);
  const connPct = db.data ? pct(db.data.active_connections, db.data.max_connections) : 0;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13.5px] text-dim">
          Plan: <span className="font-semibold text-white">{limits.planLabel}</span> — change with
          <code className="mx-1 rounded bg-surfhi px-1.5 py-0.5 font-mono text-[12px] text-snap">SUPABASE_PLAN</code>
          if you upgrade.
        </p>
        <p className="font-mono text-[11px] text-faint">
          DB stats {relativeTime(db.updatedAt)} · ping {relativeTime(ping.updatedAt)}
        </p>
      </div>

      {db.error ? <ErrorBanner message={db.error} /> : null}

      {/* ---------- live ping ---------- */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-faint">Live latency</p>
              <p className="num font-display text-[34px] text-snap">
                {ping.data?.ok ? `${ping.data.ms.toFixed(1)} ms` : ping.loading ? '—' : 'down'}
              </p>
              {avgPing != null ? (
                <p className="text-[12px] text-dim">avg last {history.current.length}: {avgPing.toFixed(1)} ms</p>
              ) : null}
            </div>
            <Sparkline values={history.current} />
          </div>
          {ping.data && !ping.data.ok ? (
            <p className="mt-2 text-[12.5px] text-flame">{ping.data.error}</p>
          ) : null}
        </Card>

        <Card className="grid place-items-center p-5">
          <div className="text-center">
            <p className="num font-display text-[30px]">
              {db.data ? `${db.data.active_connections}/${db.data.max_connections}` : '—'}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-faint">Connections</p>
          </div>
        </Card>
      </section>

      {/* ---------- usage vs limits ---------- */}
      <section className="mt-10">
        <SectionTitle sub="Ceilings are Supabase's published plan limits, not measured live — see lib/limits.ts.">
          Usage vs. plan limits
        </SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card className="p-5">
            <p className="mb-2 flex items-baseline justify-between">
              <span className="font-semibold">Database size</span>
              <span className="num text-dim">
                {db.data ? formatBytes(usedBytes) : '—'} / {formatBytes(limits.databaseBytes)}
              </span>
            </p>
            {db.data ? (
              <UsageBar pct={dbPct} sub={`${dbPct.toFixed(1)}% of ${limits.planLabel}`} />
            ) : (
              // 0% would claim a measurement that hasn't happened — an
              // unmeasured database isn't the same fact as an empty one, and
              // the bar shouldn't say otherwise while this is still loading
              // or the connection to Supabase is down.
              <p className="font-mono text-[11px] text-faint">Not measured yet</p>
            )}
          </Card>
          <Card className="p-5">
            <p className="mb-2 flex items-baseline justify-between">
              <span className="font-semibold">Active connections</span>
              <span className="num text-dim">
                {db.data?.active_connections ?? '—'} / {db.data?.max_connections ?? '—'}
              </span>
            </p>
            {db.data ? (
              <UsageBar pct={connPct} sub="Postgres connections, not Realtime sockets" />
            ) : (
              <p className="font-mono text-[11px] text-faint">Not measured yet</p>
            )}
          </Card>
        </div>
        <p className="mt-3 text-[12.5px] text-dim">
          Realtime concurrent connections (the number that actually caps how many phones can have the
          app open at once) isn&apos;t exposed by any API — Supabase only shows it on the project
          dashboard&apos;s own Realtime page. This project&apos;s ceiling on {limits.planLabel}:{' '}
          <span className="font-semibold text-white">{limits.realtimeConcurrent}</span> concurrent.
        </p>
      </section>

      {/* ---------- row counts ---------- */}
      <section className="mt-10">
        <SectionTitle>Row counts</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {db.data
            ? Object.entries(db.data.row_counts).map(([k, v]) => (
                <StatTile key={k} value={v.toLocaleString()} label={k.replace(/_/g, ' ')} />
              ))
            : Array.from({ length: 4 }).map((_, i) => <StatTile key={i} value="—" label="…" />)}
        </div>
      </section>

      {/* ---------- table sizes ---------- */}
      <section className="mt-10">
        <SectionTitle>Table sizes</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-edge font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 py-3 font-semibold">Table</th>
                <th className="px-4 py-3 font-semibold text-right">Data</th>
                <th className="px-4 py-3 font-semibold text-right">Indexes</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(db.data?.table_sizes ?? []).map((t) => (
                <tr key={t.table_name} className="border-b border-edge/60 last:border-0">
                  <td className="px-4 py-3 font-mono text-[12.5px]">{t.table_name}</td>
                  <td className="px-4 py-3 text-right num text-dim">{formatBytes(t.table_bytes)}</td>
                  <td className="px-4 py-3 text-right num text-dim">{formatBytes(t.index_bytes)}</td>
                  <td className="px-4 py-3 text-right num font-semibold">{formatBytes(t.total_bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* ---------- slow queries ---------- */}
      <section className="mt-10">
        <SectionTitle sub="The earliest signal that a view needs a denormalised counter instead of an aggregate.">
          Slowest queries
        </SectionTitle>
        {!db.data ? (
          <Card className="p-5">
            <p className="font-mono text-[11px] text-faint">Not measured yet</p>
          </Card>
        ) : !db.data.pg_stat_statements_enabled ? (
          <Card className="p-5">
            <p className="text-[13.5px] text-dim">
              <code className="rounded bg-surfhi px-1.5 py-0.5 font-mono text-[12px] text-snap">
                pg_stat_statements
              </code>{' '}
              isn&apos;t enabled on this project. Turn it on in Supabase → Database → Extensions to see
              this.
            </p>
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-edge font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                  <th className="px-4 py-3 font-semibold">Query</th>
                  <th className="px-4 py-3 font-semibold text-right">Calls</th>
                  <th className="px-4 py-3 font-semibold text-right">Avg ms</th>
                </tr>
              </thead>
              <tbody>
                {(db.data?.slow_queries ?? []).map((q, i) => (
                  <tr key={i} className="border-b border-edge/60 last:border-0">
                    <td className="max-w-[440px] truncate px-4 py-3 font-mono text-[11.5px] text-dim">
                      {q.query}
                    </td>
                    <td className="px-4 py-3 text-right num">{q.calls}</td>
                    <td className="px-4 py-3 text-right num font-semibold">
                      <span className={q.avg_ms > 200 ? 'text-flame' : q.avg_ms > 50 ? 'text-warn' : ''}>
                        {q.avg_ms.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <p className="mt-10 font-mono text-[11px] leading-relaxed text-faint">
        Limits verified against supabase.com/pricing on 2026-09-09 — reconfirm there before treating
        these as exact. <Pill>docs/V3.md</Pill> has the scaling notes these numbers feed into.
      </p>
    </div>
  );
}
