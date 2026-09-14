'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const TABS = [
  { href: '/', label: 'Overview' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/database', label: 'Database' },
  { href: '/roadmap', label: 'Roadmap' },
  { href: '/ai-context', label: 'AI Context' },
] as const;

// Reserved for the 'god' role — fetched at runtime (see below) rather than
// baked into TABS, since which tabs render depends on who's signed in.
const GOD_TABS = [
  { href: '/moderation', label: 'Moderation' },
  { href: '/admins', label: 'Admins' },
] as const;

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  // null while loading, so a regular admin never sees the god tabs flash
  // on screen for one frame before this resolves.
  const [role, setRole] = useState<'admin' | 'god' | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data?.role) setRole(data.role);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const tabs = role === 'god' ? [...TABS, ...GOD_TABS] : TABS;

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  };

  return (
    <header className="border-b border-edge">
      {/*
        Stacked below `sm`, one row above it. A single non-wrapping flex row
        (justify-between, no flex-wrap) was overflowing the body horizontally
        below ~380px — logo + wordmark + two tabs + sign-out don't fit on one
        line on a phone, and nothing let them drop to a second line. Explicit
        flex-col -> sm:flex-row is more predictable here than relying on wrap
        heuristics to land the sign-out button somewhere sensible.
      */}
      <div className="mx-auto flex max-w-6xl flex-col gap-2.5 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 120 120" aria-hidden="true" className="shrink-0">
            <g stroke="#fffc00" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M8,34 L8,8 L34,8" />
              <path d="M86,8 L112,8 L112,34" />
              <path d="M8,86 L8,112 L34,112" />
              <path d="M112,86 L112,112 L86,112" />
              <line x1="52" y1="60" x2="68" y2="60" strokeWidth="7" />
              <circle cx="44" cy="60" r="9" fill="#fffc00" stroke="none" />
              <circle cx="76" cy="60" r="9" fill="#fffc00" stroke="none" />
            </g>
          </svg>
          <span className="font-display text-[17px] font-extrabold leading-none sm:text-[18px]">
            Tagit <span className="text-snap">ops</span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <nav className="flex flex-wrap gap-1">
            {tabs.map((t) => {
              const active = pathname === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${
                    active ? 'bg-snap text-black' : 'text-dim hover:text-white'
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <button
            onClick={logout}
            className="rounded-full border border-edge px-3.5 py-1.5 text-[12.5px] font-bold text-dim transition hover:border-flame hover:text-flame"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
