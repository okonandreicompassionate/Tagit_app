'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePolling } from '@/lib/usePolling';
import { Card, ErrorBanner, Pill, SectionTitle } from '@/lib/ui';

type CardData = {
  id: string;
  name: string;
  nickname: string | null;
  avatar: string | null;
  socials: Record<string, string> | null;
  swag: number;
  owner: string | null;
  created_at: string;
};

type LinkRow = {
  id: number;
  to_card: string;
  otherName: string;
  event_id: string | null;
  direction: 'scanned' | 'scanned_by';
  points: number;
  created_at: string;
};

type CheckinRow = { id: number; event_id: string; method: 'qr' | 'code'; created_at: string };

type FriendshipRow = {
  otherId: string;
  otherName: string;
  status: 'pending' | 'accepted' | 'blocked';
  asked_by: string;
  created_at: string;
};

type EventRow = { id: string; name: string; visibility: string; starts_at: string | null };
type BoostRow = { id: number; event_id: string; amount_kobo: number; status: string; created_at: string };

type Detail = {
  card: CardData;
  links: LinkRow[];
  checkins: CheckinRow[];
  friendships: FriendshipRow[];
  hostedEvents: EventRow[];
  boosts: BoostRow[];
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const friendshipTone: Record<FriendshipRow['status'], 'good' | 'warn' | 'flame'> = {
  accepted: 'good',
  pending: 'warn',
  blocked: 'flame',
};

export function AccountDetailClient({ id }: { id: string }) {
  const { data, error } = usePolling<Detail>(`/api/accounts/${encodeURIComponent(id)}`, 30_000);
  const [showRaw, setShowRaw] = useState(false);

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!data) {
    return <div className="mx-auto max-w-6xl px-5 py-8 text-dim sm:px-8">Loading…</div>;
  }

  const { card } = data;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link href="/accounts" className="text-[13px] font-bold text-dim hover:text-white">
        ‹ All accounts
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[26px] font-extrabold">{card.nickname || card.name}</h1>
        <Pill tone={card.owner ? 'good' : 'default'}>{card.owner ? 'Signed in' : 'Unclaimed'}</Pill>
      </div>
      <p className="mt-1 text-[13.5px] text-snap">@{card.id}</p>
      <p className="mt-1 text-[12.5px] text-faint">
        {card.swag.toLocaleString()} swag · joined {when(card.created_at)}
      </p>

      <button
        onClick={() => setShowRaw((v) => !v)}
        className="mt-4 rounded-full border border-edge px-3 py-1.5 text-[12px] font-bold text-dim hover:text-white"
      >
        {showRaw ? 'Hide' : 'Show'} raw card JSON
      </button>
      {showRaw ? (
        <pre className="mt-3 overflow-x-auto rounded-xl border border-edge bg-surface p-4 text-[11.5px] text-dim">
          {JSON.stringify(card, null, 2)}
        </pre>
      ) : null}

      <section className="mt-10">
        <SectionTitle sub="from_card = this account, either direction — see LinkEvent's own doc comment in the app for what that means.">
          Links ({data.links.length})
        </SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-edge font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 py-3 font-semibold">Who</th>
                <th className="px-4 py-3 font-semibold">Direction</th>
                <th className="px-4 py-3 font-semibold">Event</th>
                <th className="px-4 py-3 font-semibold text-right">Points</th>
                <th className="px-4 py-3 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {data.links.map((l) => (
                <tr key={l.id} className="border-b border-edge/60 last:border-0">
                  <td className="px-4 py-3 font-semibold">{l.otherName}</td>
                  <td className="px-4 py-3 text-dim">{l.direction === 'scanned' ? 'scanned them' : 'scanned by them'}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-dim">{l.event_id ?? '—'}</td>
                  <td className="px-4 py-3 text-right num">{l.points}</td>
                  <td className="px-4 py-3 text-dim">{when(l.created_at)}</td>
                </tr>
              ))}
              {data.links.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-dim" colSpan={5}>
                    No scans recorded server-side.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="mt-10">
        <SectionTitle>Check-ins ({data.checkins.length})</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-edge font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 py-3 font-semibold">Event</th>
                <th className="px-4 py-3 font-semibold">Method</th>
                <th className="px-4 py-3 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {data.checkins.map((c) => (
                <tr key={c.id} className="border-b border-edge/60 last:border-0">
                  <td className="px-4 py-3 font-mono text-[12px]">{c.event_id}</td>
                  <td className="px-4 py-3">
                    <Pill tone={c.method === 'qr' ? 'good' : 'default'}>{c.method}</Pill>
                  </td>
                  <td className="px-4 py-3 text-dim">{when(c.created_at)}</td>
                </tr>
              ))}
              {data.checkins.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-dim" colSpan={3}>
                    No check-ins.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="mt-10">
        <SectionTitle>Friendships ({data.friendships.length})</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-edge font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 py-3 font-semibold">Who</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Asked by</th>
                <th className="px-4 py-3 font-semibold">Since</th>
              </tr>
            </thead>
            <tbody>
              {data.friendships.map((f) => (
                <tr key={f.otherId} className="border-b border-edge/60 last:border-0">
                  <td className="px-4 py-3 font-semibold">{f.otherName}</td>
                  <td className="px-4 py-3">
                    <Pill tone={friendshipTone[f.status]}>{f.status}</Pill>
                  </td>
                  <td className="px-4 py-3 text-dim">{f.asked_by === id ? 'them' : 'this account'}</td>
                  <td className="px-4 py-3 text-dim">{when(f.created_at)}</td>
                </tr>
              ))}
              {data.friendships.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-dim" colSpan={4}>
                    No friendships.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      {data.hostedEvents.length ? (
        <section className="mt-10">
          <SectionTitle>Hosted events ({data.hostedEvents.length})</SectionTitle>
          <Card className="p-4">
            <ul className="grid gap-2 text-[13.5px]">
              {data.hostedEvents.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{e.name}</span>
                  <span className="text-dim">{e.visibility}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {data.boosts.length ? (
        <section className="mt-10">
          <SectionTitle>Boost payments ({data.boosts.length})</SectionTitle>
          <Card className="p-4">
            <ul className="grid gap-2 text-[13.5px]">
              {data.boosts.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[12px] text-dim">{b.event_id}</span>
                  <span>₦{(b.amount_kobo / 100).toLocaleString()}</span>
                  <Pill tone={b.status === 'paid' ? 'good' : b.status === 'failed' ? 'flame' : 'warn'}>
                    {b.status}
                  </Pill>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
