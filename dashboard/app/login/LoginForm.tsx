'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get('from') || '/';

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        setBusy(false);
        return;
      }
      router.replace(from);
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="password" className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">
          Admin password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          autoFocus
          autoComplete="current-password"
          className="h-12 rounded-xl border border-edge bg-surface px-4 text-[15px] text-white outline-none transition focus:border-snap"
        />
      </div>

      {error ? <p className="text-[13.5px] font-medium text-flame">{error}</p> : null}

      <button
        type="submit"
        disabled={!password || busy}
        className="h-12 rounded-full bg-snap font-bold text-black transition hover:brightness-95 disabled:opacity-40"
      >
        {busy ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  );
}
