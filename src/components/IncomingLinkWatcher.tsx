import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { getCard } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useMe, useTagStore } from '../store/useTagStore';

/**
 * Makes a scan mutual from the scanned person's side.
 *
 * When A scans B, a database trigger writes the mirrored link for B. This
 * listens for that row and pops A's profile on B's phone — so one scan shows
 * both people each other, and nobody has to scan twice.
 *
 * Renders nothing. Mounted once, near the root.
 *
 * Realtime respects RLS, and `links_read_own` restricts rows to links where
 * the reader owns one of the two cards — so this can only ever hear about the
 * user's own links, never anyone else's graph.
 */
export function IncomingLinkWatcher() {
  const router = useRouter();
  const me = useMe();
  const receiveLink = useTagStore((s) => s.receiveLink);
  const rememberedEvents = useTagStore((s) => s.events);

  useEffect(() => {
    if (!supabase || !me) return;

    const channel = supabase
      .channel(`links-in-${me.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'links',
          filter: `to_card=eq.${me.id}`,
        },
        (payload) => {
          const row = payload.new as {
            from_card?: string;
            direction?: string;
            event_id?: string | null;
            created_at?: string;
          };

          // Only react to the outward scan. The mirrored 'scanned_by' row is
          // the one this user's own scanning already produced.
          if (row.direction !== 'scanned' || !row.from_card) return;

          void (async () => {
            try {
              const card = await getCard(row.from_card!);
              if (!card) return;

              const eventId = row.event_id ?? undefined;
              receiveLink(card, {
                eventId,
                eventName: eventId ? rememberedEvents[eventId]?.name : undefined,
                at: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
              });

              // No `scan=1`: the link is already recorded on both sides, so
              // this only opens their profile.
              router.push({ pathname: '/card/[id]', params: { id: card.id } });
            } catch (err) {
              if (__DEV__) console.warn('[realtime] incoming link failed:', err);
            }
          })();
        }
      )
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [me, receiveLink, rememberedEvents, router]);

  return null;
}
