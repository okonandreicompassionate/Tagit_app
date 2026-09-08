import { useEffect, useRef, useState } from 'react';

type State<T> = { data: T | null; error: string | null; loading: boolean; updatedAt: number | null };

/**
 * Polls an endpoint on an interval and keeps the latest result in state.
 *
 * Not a websocket — Supabase Realtime is for the app's own tables (see
 * IncomingLinkWatcher in the Expo app), but "how big is the database right
 * now" isn't a row change to subscribe to, it's a question to keep re-asking.
 * Polling is the honest way to do that, and the interval is tuned per metric:
 * fast for a ping, slower for anything that runs a real query.
 *
 * Pauses while the tab is hidden, so an admin who leaves this open in a
 * background tab all day isn't quietly hammering the database.
 */
export function usePolling<T>(url: string, intervalMs: number) {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
    updatedAt: null,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;

    async function tick() {
      if (document.hidden) {
        schedule();
        return;
      }
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const body = await res.json();
        if (stopped.current) return;
        if (!res.ok) {
          setState((s) => ({ ...s, error: body.error || `HTTP ${res.status}`, loading: false }));
        } else {
          setState({ data: body as T, error: null, loading: false, updatedAt: Date.now() });
        }
      } catch (err) {
        if (!stopped.current) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : 'Network error',
            loading: false,
          }));
        }
      } finally {
        schedule();
      }
    }

    function schedule() {
      if (stopped.current) return;
      timer.current = setTimeout(tick, intervalMs);
    }

    void tick();
    return () => {
      stopped.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, intervalMs]);

  return state;
}
