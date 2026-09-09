'use client';

import { usePolling } from '@/lib/usePolling';
import { Card, ErrorBanner, Pill, SectionTitle, StatTile, relativeTime } from '@/lib/ui';
import type { ActivityEvent } from './api/activity/route';

type EventRow = {
  id: string;
  name: string;
  type: string;
  visibility: 'public' | 'private';
  starts_at: string | null;
  location: string | null;
  city: string | null;
  sponsored: boolean;
  boost_score: number;
  boosted_until: string | null;
};

type LeaderRow = { cardId: string; name: string; handle: string; swag: number; tags: number };

type BoostRow = {
  id: number;
  event_id: string;
  card_id: string;
  kind: string;
  amount_kobo: number;
  days: number;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  created_at: string;
  paid_at: string | null;
};

type Overview = {
  totals: { cards: number; events: number; checkins: number; links: number; revenueNaira: number };
  events: EventRow[];
  leaderboard: LeaderRow[];
  boosts: BoostRow[];
};

function when(iso: string | null): string {
  if (!iso) return 'TBC';
  const d = new Date(iso);
  const days = Math.round((d.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  const t = new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days < 0) return 'Past';
  if (days === 0) return `Tonight · ${t}`;
  if (days === 1) return `Tomorrow · ${t}`;
  return `${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${t}`;
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

const boostTone: Record<BoostRow['status'], 'good' | 'warn' | 'flame' | 'default'> = {
  paid: 'good',
  pending: 'warn',
  failed: 'flame',
  refunded: 'default',
};

const activityDot: Record<ActivityEvent['kind'], string> = {
  scan: 'bg-snap',
  checkin: 'bg-good',
};

export function OverviewClient() {
  const { data, error, updatedAt } = usePolling<Overview>('/api/overview', 20_000);
  const activity = usePolling<{ events: ActivityEvent[] }>('/api/activity', 15_000);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="mb-6 flex items-baseline justify-between">
        <p className="text-[13.5px] text-dim">
          Full visibility — this reads with the service key, unlike the public ops page.
        </p>
        <p className="font-mono text-[11px] text-faint">Updated {relativeTime(updatedAt)}</p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile value={data?.totals.cards ?? '—'} label="People" accent />
        <StatTile value={data?.totals.events ?? '—'} label="Events" />
        <StatTile value={data?.totals.checkins ?? '—'} label="Check-ins" />
        <StatTile value={data?.totals.links ?? '—'} label="Scans" />
        <StatTile value={data ? naira(data.totals.revenueNaira) : '—'} label="Boost revenue" accent />
      </section>

      <section className="mt-10">
        <SectionTitle sub="The last 60 scans and check-ins, across everyone — polls every 15s.">
          Recent activity
        </SectionTitle>
        {activity.error ? <ErrorBanner message={activity.error} /> : null}
        <Card className="max-h-[420px] overflow-y-auto p-1">
          {(activity.data?.events ?? []).map((e) => (
            <div key={e.key} className="flex items-center gap-3 border-b border-edge/60 px-3.5 py-2.5 last:border-0">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${activityDot[e.kind]}`} />
              <p className="flex-1 truncate text-[13px]">
                <span className="font-semibold">{e.who}</span>{' '}
                <span className="text-dim">{e.detail}</span>
              </p>
              <span className="shrink-0 font-mono text-[11px] text-faint">
                {new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          ))}
          {activity.data && activity.data.events.length === 0 ? (
            <p className="px-3.5 py-6 text-[13px] text-dim">Nothing yet.</p>
          ) : null}
        </Card>
      </section>

      <section className="mt-10">
        <SectionTitle sub="Public and private both — this is the real list, not what Discover shows.">
          Events
        </SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-edge font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 py-3 font-semibold">Event</th>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Where</th>
                <th className="px-4 py-3 font-semibold">Visibility</th>
                <th className="px-4 py-3 font-semibold">Placement</th>
              </tr>
            </thead>
            <tbody>
              {(data?.events ?? []).map((e) => {
                const boosted = e.boosted_until && new Date(e.boosted_until) > new Date();
                return (
                  <tr key={e.id} className="border-b border-edge/60 last:border-0">
                    <td className="px-4 py-3 font-semibold">{e.name}</td>
                    <td className="px-4 py-3 text-dim">{when(e.starts_at)}</td>
                    <td className="px-4 py-3 text-dim">
                      {[e.location, e.city].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={e.visibility === 'private' ? 'warn' : 'default'}>{e.visibility}</Pill>
                    </td>
                    <td className="px-4 py-3">
                      {e.sponsored ? (
                        <Pill tone="snap">Featured</Pill>
                      ) : boosted ? (
                        <Pill tone="snap">Boosted</Pill>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data && data.events.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-dim" colSpan={5}>
                    No events yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="mt-10">
        <SectionTitle>Money — boosts</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-edge font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Event</th>
                <th className="px-4 py-3 font-semibold">Kind</th>
                <th className="px-4 py-3 font-semibold text-right">Amount</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.boosts ?? []).map((b) => (
                <tr key={b.id} className="border-b border-edge/60 last:border-0">
                  <td className="px-4 py-3 text-dim">{new Date(b.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{b.event_id}</td>
                  <td className="px-4 py-3 text-dim capitalize">{b.kind}</td>
                  <td className="px-4 py-3 text-right num font-semibold">{naira(b.amount_kobo / 100)}</td>
                  <td className="px-4 py-3">
                    <Pill tone={boostTone[b.status]}>{b.status}</Pill>
                  </td>
                </tr>
              ))}
              {data && data.boosts.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-dim" colSpan={5}>
                    No boost payments yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="mt-10">
        <SectionTitle>Leaderboard</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-edge font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Handle</th>
                <th className="px-4 py-3 font-semibold text-right">Swag</th>
                <th className="px-4 py-3 font-semibold text-right">Met</th>
              </tr>
            </thead>
            <tbody>
              {(data?.leaderboard ?? []).map((r, i) => (
                <tr key={r.cardId} className="border-b border-edge/60 last:border-0">
                  <td className="px-4 py-3 num text-faint">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold">{r.name}</td>
                  <td className="px-4 py-3 text-snap">@{r.handle}</td>
                  <td className="px-4 py-3 text-right num font-bold">{r.swag.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right num text-dim">{r.tags}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
