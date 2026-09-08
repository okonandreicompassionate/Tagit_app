/**
 * Supabase's published plan ceilings, as of the date below. Hardcoded rather
 * than fetched: there is no public API that returns "what does my plan
 * allow," only the billing dashboard, so this has to be maintained by hand.
 *
 * Verified against supabase.com/pricing and Supabase's own docs on
 * 2026-09-09. Re-check there before trusting these for a real capacity
 * decision — Supabase has changed these numbers before and will again.
 */

export type Plan = 'free' | 'pro';

export type Limits = {
  label: string;
  databaseBytes: number;
  storageBytes: number;
  realtimeConcurrent: number;
  realtimeMessagesPerMonth: number;
  monthlyActiveUsers: number;
  dbEgressBytesPerMonth: number;
};

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export const LIMITS: Record<Plan, Limits> = {
  free: {
    label: 'Free',
    databaseBytes: 500 * MB,
    storageBytes: 1 * GB,
    realtimeConcurrent: 200,
    realtimeMessagesPerMonth: 2_000_000,
    monthlyActiveUsers: 50_000,
    dbEgressBytesPerMonth: 5 * GB,
  },
  pro: {
    label: 'Pro ($25/mo base)',
    databaseBytes: 8 * GB,
    storageBytes: 100 * GB,
    realtimeConcurrent: 500,
    // Pro's realtime message allowance scales with usage-based billing
    // rather than a hard included number the way Free's does; treated as
    // effectively unbounded here rather than guessing a figure.
    realtimeMessagesPerMonth: Infinity,
    monthlyActiveUsers: 100_000,
    dbEgressBytesPerMonth: 250 * GB,
  },
};

export function currentPlan(): Plan {
  const raw = (process.env.SUPABASE_PLAN ?? 'free').toLowerCase();
  return raw === 'pro' ? 'pro' : 'free';
}

export function currentLimits(): Limits {
  return LIMITS[currentPlan()];
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—';
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

export function pct(used: number, ceiling: number): number {
  if (!Number.isFinite(ceiling) || ceiling <= 0) return 0;
  return Math.min(100, Math.max(0, (used / ceiling) * 100));
}
