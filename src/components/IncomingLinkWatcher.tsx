import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { getCard } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useMe, useTagStore } from '../store/useTagStore';

/**
 * Makes a scan mutual from the scanned person's side.
 *
 * When A scans B, a database trigger writes the mirrored link for B. This
 * listens for that row and pops a full-screen takeover on B's phone showing
 * A's profile — with the same "Add on Snap" button A saw — so one scan shows
 * both people each other, and nobody has to scan twice. The screen it opens
 * (`card/[id]`) is already a modal presentation in the router config, so this
 * genuinely takes the screen over regardless of what B was doing.
 *
 * Two things this deliberately does NOT try to do:
 *  - Show the exact swag just earned. The server prices a reciprocal link
 *    differently from an outbound one (see `mirror_link()`), and this project
 *    has already hit real bugs from client and server scoring logic quietly
 *    drifling apart — so rather than re-derive a number that might be wrong,
 *    this refetches the user's own card and takes the server's total as
 *    truth. Slower than a guess, never inaccurate.
 *  - Distinguish itself with router state alone. `incoming=1` on the push is
 *    what tells `card/[id]` to render the "just scanned you" banner instead
 *    of the ordinary profile header.
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
  const adoptCard = useTagStore((s) => s.adoptCard);

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
              // this only opens their profile. `incoming=1` is what makes the
              // sheet greet this as "you were just scanned" rather than an
              // ordinary profile open.
              router.push({
                pathname: '/card/[id]',
                params: { id: card.id, incoming: '1' },
              });

              // The mirror trigger just changed this user's own swag total on
              // the server. The local copy has no way to know that on its
              // own — refetch rather than estimate, so the number shown
              // anywhere in the app (tier, profile, leaderboard row) is the
              // server's real total, not a guess that could drift from it.
              if (me) {
                getCard(me.id)
                  .then((mine) => {
                    if (mine) adoptCard(mine);
                  })
                  .catch(() => {});
              }
            } catch (err) {
              if (__DEV__) console.warn('[realtime] incoming link failed:', err);
            }
          })();
        }
      )
      .subscribe((status, err) => {
        // SUBSCRIBED is the only status that means this is actually live —
        // CHANNEL_ERROR/TIMED_OUT/CLOSED all mean the popup silently won't
        // fire, with nothing else in the app able to tell. CodePane's poll
        // is the fallback for exactly that; this is just so it's visible
        // somewhere if it happens again.
        if (__DEV__ && status !== 'SUBSCRIBED') {
          console.warn('[realtime] links channel status:', status, err ?? '');
        }
      });

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [me, receiveLink, rememberedEvents, router]);

  return null;
}
