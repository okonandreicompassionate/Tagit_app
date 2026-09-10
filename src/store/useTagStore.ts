import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as api from '../lib/api';
import { deriveAbout, type About } from '../lib/about';
import * as eventsApi from '../lib/eventsApi';
import { pointsForCheckIn, pointsForLink, streakFrom, totalPoints, type Award } from '../lib/swag';
import type {
  Card,
  CheckIn,
  LinkEvent,
  SocialKey,
  TagEvent,
  TaggedPerson,
} from '../types';

type State = {
  me: Card | null;
  /** Keyed by card id so a re-scan updates in place instead of duplicating. */
  tagged: Record<string, TaggedPerson>;
  /** Events the user has joined or checked into, keyed by id. */
  events: Record<string, TagEvent>;
  /** Proof of presence, keyed by event id — one per event. */
  checkins: Record<string, CheckIn>;
  activeEventId: string | null;
  /** Points from the most recent scan, held just long enough to animate them. */
  lastAwards: Award[] | null;
  hydrated: boolean;
  /** Anything after this is "new" for the notifications badge. */
  lastSeenNotificationsAt: number;
  /**
   * Keys (`${cardId}:${at}`) of incoming scans already routed to the
   * takeover popup this session. Three independent things can notice the
   * same scan — Realtime (IncomingLinkWatcher), CodePane's poll fallback,
   * and the launch-time sync — each racing an async round trip against its
   * own snapshot of `tagged`, so none of them alone can reliably tell "is
   * this new" without a shared, synchronous point of truth. Session-only,
   * not persisted: it only needs to survive the seconds between two
   * detectors racing, not across app restarts.
   */
  shownIncoming: Set<string>;
};

type Actions = {
  /** Returns whether the card actually reached the server — see the doc
   * comment on the implementation for why that's worth checking here. */
  createMe: (input: {
    name: string;
    nickname?: string;
    avatar?: string;
    id: string;
    socials: Partial<Record<SocialKey, string>>;
    snapScore?: number;
  }) => Promise<boolean>;
  updateMe: (patch: Partial<Omit<Card, 'id' | 'createdAt'>>) => Promise<void>;
  /** Records a scan in both directions and returns what it was worth. */
  tag: (card: Card, direction: LinkEvent['direction']) => Award[];
  /** Records attendance. `qr` is verified; `code` is not. */
  checkIn: (event: TagEvent, method: CheckIn['method']) => Award[];
  /**
   * Someone scanned *you*. The link and its points were already written and
   * priced by the database trigger, so this only mirrors it locally — it must
   * not award anything a second time.
   */
  receiveLink: (
    card: Card,
    meta: { eventId?: string; eventName?: string; at: number; direction?: LinkEvent['direction'] }
  ) => void;
  /**
   * Restores a card fetched from the server after signing in. This is what
   * "log back in" does — it replaces whatever is on this phone with the
   * account's real card, rather than starting a second one.
   */
  adoptCard: (card: Card) => void;
  /**
   * Rebuilds Tagged from the server ledger. `receiveLink` only ever hears
   * about a scan that happens to arrive over Realtime while this phone is
   * open and connected — anything that happened while it wasn't (closed,
   * offline, a fresh install) never reaches the local store any other way.
   * Call this on every app open, not just the first one.
   */
  syncTagged: () => Promise<{ card: Card; at: number }[]>;
  markNotificationsSeen: () => void;
  /** Atomically checks-and-marks an incoming-scan key as shown. Returns
   * true the first time a key is seen (go ahead and show the popup), false
   * on every call after (something else already claimed it). */
  claimIncomingPopup: (key: string) => boolean;
  clearAwards: () => void;
  setNote: (cardId: string, note: string) => void;
  markAddedOnSnap: (cardId: string) => void;
  untag: (cardId: string) => void;
  joinEventByCode: (code: string) => Promise<TagEvent | null>;
  rememberEvent: (event: TagEvent) => void;
  setActiveEvent: (eventId: string | null) => void;
  reset: () => void;
};

const initial: State = {
  me: null,
  tagged: {},
  events: {},
  checkins: {},
  activeEventId: null,
  lastAwards: null,
  hydrated: false,
  lastSeenNotificationsAt: 0,
  shownIncoming: new Set(),
};

export const useTagStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...initial,

      createMe: async (input) => {
        const card: Card = {
          id: input.id.toLowerCase(),
          name: input.name.trim(),
          nickname: input.nickname?.trim() || undefined,
          avatar: input.avatar,
          socials: input.socials,
          snapScore: input.snapScore,
          swag: 0,
          createdAt: Date.now(),
        };
        set({ me: card });

        // Local-first, still — the card exists on this phone the instant
        // onboarding finishes, sync or no sync. But a card that never
        // reaches the server is invisible to anyone who scans it, and
        // nothing else finds out until this phone happens to reopen with a
        // connection (the self-heal in app/index.tsx). Registration is the
        // one moment worth spending a few extra seconds retrying for, so
        // the caller can tell someone in real time rather than leaving them
        // to discover it the way a friend already has.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await api.saveCard(card);
            return true;
          } catch (err) {
            if (__DEV__) console.warn(`[store] createMe sync attempt ${attempt + 1} failed:`, err);
            if (attempt < 2) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          }
        }
        return false;
      },

      updateMe: async (patch) => {
        const me = get().me;
        if (!me) return;
        const next = { ...me, ...patch };
        set({ me: next });
        try {
          await api.saveCard(next);
        } catch (err) {
          if (__DEV__) console.warn('[store] updateMe sync failed:', err);
        }
      },

      tag: (card, direction) => {
        const { me, tagged, events, activeEventId } = get();
        if (card.id === me?.id) return [];

        const event = activeEventId ? events[activeEventId] : undefined;
        const link: LinkEvent = {
          at: Date.now(),
          eventId: event?.id,
          eventName: event?.name,
          direction,
        };

        const existing = tagged[card.id];
        // Events we've already scored a "first tag here" bonus at.
        const eventsSeen = [
          ...new Set(
            Object.values(tagged)
              .flatMap((p) => p.links.map((l) => l.eventId))
              .filter((id): id is string => Boolean(id))
          ),
        ];

        const awards = pointsForLink({ existing, link, eventsSeen });
        const gained = totalPoints(awards);
        const links = [...(existing?.links ?? []), link];

        set({
          tagged: {
            ...tagged,
            [card.id]: {
              // Refresh their card on every scan — handles change.
              card,
              links,
              streak: streakFrom(links),
              note: existing?.note,
              addedOnSnap: existing?.addedOnSnap ?? false,
            },
          },
          me: me ? { ...me, swag: me.swag + gained } : me,
          lastAwards: awards,
        });

        if (me) {
          void api.recordLink({
            fromCardId: me.id,
            toCardId: card.id,
            link,
            points: gained,
          });
        }

        return awards;
      },

      checkIn: (event, method) => {
        const { me, checkins, events } = get();

        const awards = pointsForCheckIn({
          method,
          eventId: event.id,
          eventsCheckedIn: Object.values(checkins)
            .filter((c) => c.method === 'qr')
            .map((c) => c.eventId),
        });
        const gained = totalPoints(awards);

        const previous = checkins[event.id];
        const record: CheckIn = {
          eventId: event.id,
          eventName: event.name,
          // A typed code never downgrades a scan that already happened.
          method: previous?.method === 'qr' ? 'qr' : method,
          at: previous?.at ?? Date.now(),
          type: event.type,
          city: event.city,
        };

        set({
          checkins: { ...checkins, [event.id]: record },
          events: { ...events, [event.id]: { ...event, joinedAt: event.joinedAt ?? Date.now() } },
          // Checking in is the clearest possible signal of where you are, so
          // it takes over event attribution for subsequent scans.
          activeEventId: event.id,
          me: me ? { ...me, swag: me.swag + gained } : me,
          lastAwards: awards.length ? awards : null,
        });

        if (me) void eventsApi.recordCheckIn({ cardId: me.id, eventId: event.id, method });

        return awards;
      },

      receiveLink: (card, meta) => {
        const { tagged, me } = get();
        if (card.id === me?.id) return;

        const existing = tagged[card.id];
        // Same scan arriving twice (a reconnect replaying it) must not stack.
        if (existing?.links.some((l) => Math.abs(l.at - meta.at) < 1000)) return;

        const link: LinkEvent = {
          at: meta.at,
          eventId: meta.eventId,
          eventName: meta.eventName,
          direction: meta.direction ?? 'scanned_by',
        };
        const links = [...(existing?.links ?? []), link];

        set({
          tagged: {
            ...tagged,
            [card.id]: {
              card,
              links,
              streak: streakFrom(links),
              note: existing?.note,
              addedOnSnap: existing?.addedOnSnap ?? false,
            },
          },
        });
      },

      adoptCard: (card) => set({ me: card }),

      syncTagged: async () => {
        const me = get().me;
        if (!me) return [];
        try {
          const rows = await api.myLinks(me.id);
          if (!rows.length) return [];

          const before = get().tagged;
          const ids = [...new Set(rows.map((r) => r.to_card))];
          const cards = await api.getCards(ids);
          const byId = new Map(cards.map((c) => [c.id, c]));

          // Rows this device didn't already know about, and where the OTHER
          // person did the scanning ('scanned_by' — see LinkEvent's doc
          // comment) — the ones worth surfacing as "you were just scanned",
          // not just quietly merged. Checked against timestamp, not just
          // whether the person is known, so a second scan from someone
          // already on this list still counts.
          const freshIncoming: { card: Card; at: number }[] = [];

          // Reuses receiveLink's own merge and dedupe rather than a wholesale
          // overwrite, so a scan this device already knows about from a live
          // Realtime event doesn't get double-counted when the ledger is
          // fetched again on top of it.
          for (const row of rows) {
            const card = byId.get(row.to_card);
            if (!card) continue; // the card was since deleted
            const at = new Date(row.created_at).getTime();

            const known = before[row.to_card]?.links ?? [];
            const isNew = !known.some((l) => Math.abs(l.at - at) < 1000);
            if (isNew && row.direction === 'scanned_by') freshIncoming.push({ card, at });

            get().receiveLink(card, { eventId: row.event_id ?? undefined, at, direction: row.direction });
          }

          // A fresh incoming scan just changed this card's own swag total
          // server-side (the mirror trigger's points, same as any other
          // link). IncomingLinkWatcher already refetches for exactly this
          // reason when Realtime catches a scan live — this is the same fix
          // for the two callers that only ever learn about one through this
          // function (CodePane's poll, and the launch-time sync), which
          // otherwise never touch `me` and would leave its swag stale until
          // something unrelated happened to refresh it.
          if (freshIncoming.length) {
            try {
              const mine = await api.getCard(me.id);
              if (mine) get().adoptCard(mine);
            } catch {
              // Not worth failing the sync over; swag catches up next time.
            }
          }

          return freshIncoming;
        } catch (err) {
          if (__DEV__) console.warn('[store] syncTagged failed:', err);
          return [];
        }
      },

      clearAwards: () => set({ lastAwards: null }),

      markNotificationsSeen: () => set({ lastSeenNotificationsAt: Date.now() }),

      claimIncomingPopup: (key) => {
        const { shownIncoming } = get();
        if (shownIncoming.has(key)) return false;
        // A fresh Set, not a mutation of the existing one — this runs from
        // more than one caller in close succession, and a mutated-in-place
        // Set would still correctly dedupe here (this action is itself
        // synchronous, no race within it), but replacing it keeps the same
        // "always a new object" contract every other action in this store
        // follows.
        const next = new Set(shownIncoming);
        next.add(key);
        set({ shownIncoming: next });
        return true;
      },

      setNote: (cardId, note) => {
        const person = get().tagged[cardId];
        if (!person) return;
        set({ tagged: { ...get().tagged, [cardId]: { ...person, note } } });
      },

      markAddedOnSnap: (cardId) => {
        const person = get().tagged[cardId];
        if (!person || person.addedOnSnap) return;
        set({ tagged: { ...get().tagged, [cardId]: { ...person, addedOnSnap: true } } });
      },

      untag: (cardId) => {
        const next = { ...get().tagged };
        delete next[cardId];
        set({ tagged: next });
      },

      joinEventByCode: async (code) => {
        const event = await eventsApi.findEventByCode(code);
        if (!event) return null;
        // Typing a code is joining, not attending — it earns nothing.
        get().checkIn(event, 'code');
        return event;
      },

      rememberEvent: (event) => {
        set({ events: { ...get().events, [event.id]: event } });
      },

      setActiveEvent: (eventId) => set({ activeEventId: eventId }),

      reset: () => set({ ...initial, shownIncoming: new Set(), hydrated: true }),
    }),
    {
      name: 'tag-store-v2',
      storage: createJSONStorage(() => AsyncStorage),
      // `hydrated` and `lastAwards` are session state, never persisted.
      partialize: ({ me, tagged, events, checkins, activeEventId, lastSeenNotificationsAt }) => ({
        me,
        tagged,
        events,
        checkins,
        activeEventId,
        lastSeenNotificationsAt,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error && __DEV__) console.warn('[store] rehydrate failed:', error);
        // 0 (the field's default before it ever existed) reads as "every
        // scan ever" is unseen — every install that had Tagged history
        // before this field shipped would open to a meaningless full-badge
        // notification count. A fresh install has nothing to falsely hide
        // either way, so it's safe to just stamp "now" the first time this
        // is seen, real history or none.
        if (state && state.lastSeenNotificationsAt === 0) {
          useTagStore.setState({ lastSeenNotificationsAt: Date.now() });
        }
        useTagStore.setState({ hydrated: true });
      },
    }
  )
);

/* ---- selectors ---- */

export const useMe = () => useTagStore((s) => s.me);
export const useHydrated = () => useTagStore((s) => s.hydrated);

export const useTaggedList = (): TaggedPerson[] => {
  const tagged = useTagStore((s) => s.tagged);
  return Object.values(tagged).sort((a, b) => lastLink(b) - lastLink(a));
};

export const lastLink = (p: TaggedPerson) =>
  p.links.length ? Math.max(...p.links.map((l) => l.at)) : 0;

/**
 * Drives the notifications badge. Counts only incoming scans, not everything
 * the notifications screen shows (a pending friend request is server state,
 * not something synced into local `tagged` the same way) — good enough for
 * "something's new", not a perfectly exhaustive count.
 */
export const useUnseenNotificationCount = (): number => {
  const tagged = useTagStore((s) => s.tagged);
  const lastSeen = useTagStore((s) => s.lastSeenNotificationsAt);
  return Object.values(tagged).reduce(
    (n, p) => n + p.links.filter((l) => l.direction === 'scanned_by' && l.at > lastSeen).length,
    0
  );
};

export const useActiveEvent = (): TagEvent | null => {
  const id = useTagStore((s) => s.activeEventId);
  const events = useTagStore((s) => s.events);
  return id ? events[id] ?? null : null;
};

export const useJoinedEvents = (): TagEvent[] => {
  const events = useTagStore((s) => s.events);
  return Object.values(events).sort((a, b) => (b.joinedAt ?? 0) - (a.joinedAt ?? 0));
};

export const useCheckIns = (): CheckIn[] => {
  const checkins = useTagStore((s) => s.checkins);
  return Object.values(checkins).sort((a, b) => b.at - a.at);
};

/** The auto-generated profile. Nothing here is typed by the user. */
export function useAbout(): About {
  const checkins = useTagStore((s) => s.checkins);
  const tagged = useTagStore((s) => s.tagged);
  return deriveAbout({
    checkins: Object.values(checkins),
    people: Object.values(tagged),
  });
}

/** Everything the recap card needs, derived rather than stored. */
export function useStats() {
  const tagged = useTagStore((s) => s.tagged);
  const me = useTagStore((s) => s.me);
  const checkins = useTagStore((s) => s.checkins);

  const people = Object.values(tagged);
  const byEvent = new Map<string, number>();
  for (const p of people) {
    for (const l of p.links) {
      if (l.eventName) byEvent.set(l.eventName, (byEvent.get(l.eventName) ?? 0) + 1);
    }
  }
  const topEvent = [...byEvent.entries()].sort((a, b) => b[1] - a[1])[0];
  const verified = Object.values(checkins).filter((c) => c.method === 'qr');

  return {
    swag: me?.swag ?? 0,
    people: people.length,
    scans: people.reduce((n, p) => n + p.links.length, 0),
    longestStreak: people.reduce((n, p) => Math.max(n, p.streak), 0),
    addedOnSnap: people.filter((p) => p.addedOnSnap).length,
    events: verified.length,
    topEvent: topEvent ? { name: topEvent[0], tags: topEvent[1] } : null,
  };
}
