'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { usePolling } from '@/lib/usePolling';
import { Card, ErrorBanner, Pill, SectionTitle, StatTile, relativeTime } from '@/lib/ui';
import type { AccountRow } from '../api/accounts/route';

type Response = { accounts: AccountRow[] };

export function AccountsClient() {
  const { data, error, updatedAt } = usePolling<Response>('/api/accounts', 30_000);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  // Local overlay so a delete disappears immediately rather than waiting for
  // the next 30s poll to notice it's gone.
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  // Same idea in reverse: a freshly created card shows up right away instead
  // of waiting on the next poll.
  const [added, setAdded] = useState<AccountRow[]>([]);

  const [showAdd, setShowAdd] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newSnap, setNewSnap] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const accounts = [...added, ...(data?.accounts ?? [])].filter((a) => !removed.has(a.id));

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newId, name: newName, snap: newSnap }),
      });
      const body = await res.json();
      if (!res.ok || body.error) {
        setCreateError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setAdded((prev) => [body.account as AccountRow, ...prev]);
      setNewId('');
      setNewName('');
      setNewSnap('');
      setShowAdd(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setCreating(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.id.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.socials?.snap ?? '').toLowerCase().includes(q)
    );
  }, [accounts, query]);

  const claimed = accounts.filter((a) => a.owner).length;

  const remove = async (a: AccountRow) => {
    const warn =
      a.links || a.checkins
        ? ` They have ${a.links} scan${a.links === 1 ? '' : 's'} and ${a.checkins} check-in${a.checkins === 1 ? '' : 's'} — those go with it.`
        : '';
    const ok = window.confirm(
      `Delete @${a.id} (${a.name}) permanently?${warn}${a.owner ? ' Their email/phone frees up for reuse.' : ''} This can't be undone.`
    );
    if (!ok) return;

    setBusyId(a.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/accounts/${encodeURIComponent(a.id)}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok || body.error) {
        setRowError({ id: a.id, message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      if (body.warning) setRowError({ id: a.id, message: body.warning });
      setRemoved((prev) => new Set(prev).add(a.id));
    } catch (err) {
      setRowError({ id: a.id, message: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="mb-6 flex items-baseline justify-between">
        <p className="text-[13.5px] text-dim">
          Every real card, with the service key — delete here reaches the auth identity too, not
          just the profile.
        </p>
        <p className="font-mono text-[11px] text-faint">Updated {relativeTime(updatedAt)}</p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile value={accounts.length} label="Accounts" accent />
        <StatTile value={claimed} label="Signed in" />
        <StatTile value={accounts.length - claimed} label="Unclaimed / seed" />
      </section>

      <section className="mt-8">
        <SectionTitle sub="Deleting removes the card and, if it was ever signed into, the account behind it — cascades handle their scans, check-ins and friendships automatically.">
          Accounts
        </SectionTitle>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by handle or name…"
            className="w-full rounded-xl border border-edge bg-surface px-4 py-2.5 text-[13.5px] text-white placeholder:text-faint focus:border-snap focus:outline-none sm:w-80"
          />
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-full bg-snap px-4 py-2.5 text-[13px] font-bold text-black transition hover:brightness-95"
          >
            {showAdd ? 'Cancel' : '+ Add a test account'}
          </button>
        </div>

        {showAdd ? (
          <Card className="mb-5 p-5">
            <p className="mb-4 text-[12.5px] text-dim">
              Seeds a card directly — no phone, no email. Unclaimed, same as a demo card, until
              someone actually signs into it from the app.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-faint">
                  Handle
                </label>
                <input
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="testuser1"
                  className="w-full rounded-lg border border-edge bg-surfhi px-3 py-2 text-[13.5px] text-white placeholder:text-faint focus:border-snap focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-faint">
                  Name
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Test User"
                  className="w-full rounded-lg border border-edge bg-surfhi px-3 py-2 text-[13.5px] text-white placeholder:text-faint focus:border-snap focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-faint">
                  Snap handle (optional)
                </label>
                <input
                  value={newSnap}
                  onChange={(e) => setNewSnap(e.target.value)}
                  placeholder="handle"
                  className="w-full rounded-lg border border-edge bg-surfhi px-3 py-2 text-[13.5px] text-white placeholder:text-faint focus:border-snap focus:outline-none"
                />
              </div>
            </div>
            {createError ? <p className="mt-3 text-[12.5px] text-flame">{createError}</p> : null}
            <button
              onClick={() => void create()}
              disabled={creating || newId.trim().length < 2 || newName.trim().length < 2}
              className="mt-4 rounded-full bg-snap px-4 py-2 text-[13px] font-bold text-black disabled:opacity-40"
            >
              {creating ? 'Creating…' : 'Create card'}
            </button>
          </Card>
        ) : null}

        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-edge font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                <th className="px-4 py-3 font-semibold">Handle</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Swag</th>
                <th className="px-4 py-3 font-semibold text-right">Scans</th>
                <th className="px-4 py-3 font-semibold text-right">Check-ins</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-edge/60 last:border-0 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/accounts/${encodeURIComponent(a.id)}`} className="text-snap hover:underline">
                      @{a.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-semibold">{a.nickname || a.name}</td>
                  <td className="px-4 py-3">
                    <Pill tone={a.owner ? 'good' : 'default'}>{a.owner ? 'Signed in' : 'Unclaimed'}</Pill>
                  </td>
                  <td className="px-4 py-3 text-right num">{a.swag.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right num text-dim">{a.links}</td>
                  <td className="px-4 py-3 text-right num text-dim">{a.checkins}</td>
                  <td className="px-4 py-3 text-dim">{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void remove(a)}
                      disabled={busyId === a.id}
                      className="rounded-full border border-edge px-3 py-1.5 text-[12px] font-bold text-dim transition hover:border-flame hover:text-flame disabled:opacity-40"
                    >
                      {busyId === a.id ? 'Deleting…' : 'Delete'}
                    </button>
                    {rowError?.id === a.id ? (
                      <p className="mt-1.5 max-w-[220px] text-[11px] text-flame">{rowError.message}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
              {data && filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-dim" colSpan={8}>
                    {query ? 'No account matches that search.' : 'No accounts yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
