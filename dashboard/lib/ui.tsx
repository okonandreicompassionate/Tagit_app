import type { ReactNode } from 'react';

export function StatTile({
  value,
  label,
  accent = false,
}: {
  value: ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-edge bg-surface p-5">
      <p className={`num font-display text-[30px] ${accent ? 'text-snap' : 'text-white'}`}>{value}</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.13em] text-faint">{label}</p>
    </div>
  );
}

/** A horizontal usage bar: used-of-ceiling, colour stepping up as it fills. */
export function UsageBar({ pct, sub }: { pct: number; sub: string }) {
  const color = pct >= 90 ? 'bg-flame' : pct >= 70 ? 'bg-warn' : 'bg-snap';
  return (
    <div className="grid gap-1.5">
      <div className="h-2 overflow-hidden rounded-full bg-surfhi">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <p className="font-mono text-[11px] text-faint">{sub}</p>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-edge bg-surface ${className}`}>{children}</div>;
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-[20px] font-extrabold">{children}</h2>
      {sub ? <p className="mt-1 text-[13.5px] text-dim">{sub}</p> : null}
    </div>
  );
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'good' | 'warn' | 'flame' | 'snap' }) {
  const map: Record<string, string> = {
    default: 'border-edge text-dim',
    good: 'border-good/60 text-good',
    warn: 'border-warn/60 text-warn',
    flame: 'border-flame/60 text-flame',
    snap: 'border-snap text-snap',
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${map[tone]}`}>
      {children}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border-l-[3px] border-flame bg-surface/60 p-4 text-[13.5px] text-flame">
      {message}
    </div>
  );
}

export function relativeTime(ms: number | null): string {
  if (!ms) return '—';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 2) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}
