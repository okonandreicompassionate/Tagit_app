'use client';

import { useEffect, useState } from 'react';
import { Card, ErrorBanner, Pill, SectionTitle, relativeTime } from '@/lib/ui';
import type { AdminListRow } from '../api/admins/route';

function randomPassword(): string {
  // 16 random bytes, base64url-ish — plenty for a credential a god hands to
  // someone directly rather than typing from memory.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, 'A')
    .replace(/\//g, 'B')
    .replace(/=+$/, '');
}

export function AdminsClient() {
  const [admins, setAdmins] = useState<AdminListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [self, setSelf] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'god'>('admin');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/admins');
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setAdmins(body.admins);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  };

  useEffect(() => {
    void load();
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.email && setSelf(data.email))
      .catch(() => {});
  }, []);

  const create = async () => {
    if (!email || password.length < 10) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      const body = await res.json();
      if (!res.ok) {
        setCreateError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setEmail('');
      setPassword('');
      setRole('admin');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (admin: AdminListRow) => {
    if (!window.confirm(`Remove ${admin.email}? They lose access immediately.`)) return;
    setRemovingId(admin.id);
    try {
      const res = await fetch(`/api/admins/${admin.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      await load();
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
      <p className="mb-6 text-[13.5px] text-dim">
        God-only. A `god` admin can invite others and reach admin-only tooling (this page,
        Moderation); a plain `admin` sees everything else — Overview, Accounts, Database, Roadmap,
        AI Context.
      </p>

      {error ? <ErrorBanner message={error} /> : null}

      <Card className="mb-8 p-5">
        <SectionTitle sub="There's no email sending set up — hand the password to them yourself, out of band.">
          Invite an admin
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_auto_auto]">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="their@email.com"
            className="rounded-lg border border-edge bg-surfhi px-3 py-2 text-[13.5px] text-white placeholder:text-faint focus:border-snap focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password (10+ chars)"
              className="w-full rounded-lg border border-edge bg-surfhi px-3 py-2 text-[13.5px] text-white placeholder:text-faint focus:border-snap focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setPassword(randomPassword())}
              className="shrink-0 rounded-lg border border-edge px-3 text-[12px] font-bold text-dim hover:text-white"
            >
              Generate
            </button>
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'god')}
            className="rounded-lg border border-edge bg-surfhi px-3 py-2 text-[13.5px] text-white focus:border-snap focus:outline-none"
          >
            <option value="admin">admin</option>
            <option value="god">god</option>
          </select>
          <button
            onClick={() => void create()}
            disabled={creating || !email || password.length < 10}
            className="rounded-full bg-snap px-5 py-2 text-[13px] font-bold text-black disabled:opacity-40"
          >
            {creating ? 'Adding…' : 'Add'}
          </button>
        </div>
        {createError ? <p className="mt-3 text-[12.5px] text-flame">{createError}</p> : null}
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-edge font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Added</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {(admins ?? []).map((a) => (
              <tr key={a.id} className="border-b border-edge/60 last:border-0">
                <td className="px-4 py-3 font-semibold">
                  {a.email}
                  {a.email === self ? <span className="ml-2 text-[11px] text-faint">(you)</span> : null}
                </td>
                <td className="px-4 py-3">
                  <Pill tone={a.role === 'god' ? 'snap' : 'default'}>{a.role}</Pill>
                </td>
                <td className="px-4 py-3 text-dim">{relativeTime(new Date(a.created_at).getTime())}</td>
                <td className="px-4 py-3 text-right">
                  {a.email !== self ? (
                    <button
                      onClick={() => void remove(a)}
                      disabled={removingId === a.id}
                      className="text-[12px] font-bold text-faint hover:text-flame disabled:opacity-40"
                    >
                      {removingId === a.id ? 'Removing…' : 'Remove'}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {admins && admins.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-dim" colSpan={4}>
                  No admins yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
