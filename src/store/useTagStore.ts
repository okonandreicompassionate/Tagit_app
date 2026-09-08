import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as api from '../lib/api';
import { pointsForLink, streakFrom, totalPoints, type Award } from '../lib/swag';
import type { Card, LinkEvent, SocialKey, TagEvent, TaggedPerson } from '../types';

type State = {
  me: Card | null;
  /** Keyed by card id so a re-scan updates in place instead of duplicating. */
  tagged: Record<string, TaggedPerson>;
  events: TagEvent[];
  activeEventId: string | null;
  /** Points from the most recent scan, held just long enough to animate them. */
  lastAwards: Award[] | null;
  hydrated: boolean;
};

type Actions = {
  createMe: (input: {
    name: string;
    nickname?: string;
    bio?: string;
    avatar?: string;
    id: string;
    socials: Partial<Record<SocialKey, string>>;
    snapScore?: number;
  }) => Promise<void>;
  updateMe: (patch: Partial<Omit<Card, 'id' | 'createdAt'>>) => Promise<void>;
  /** Records a scan in both directions and returns what it was worth. */
  tag: (card: Card, direction: LinkEvent['direction']) => Award[];
  clearAwards: () => void;
  setNote: (cardId: string, note: string) => void;
  markAddedOnSnap: (cardId: string) => void;
  untag: (cardId: string) => void;
  joinEvent: (code: string) => Promise<TagEvent | null>;
  setActiveEvent: (eventId: string | null) => void;
  reset: () => void;
};

const initial: State = {
  me: null,
  tagged: {},
  events: [],
  activeEventId: null,
  lastAwards: null,
  hydrated: false,
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
          bio: input.bio?.trim() || undefined,
          avatar: input.avatar,
          socials: input.socials,
          snapScore: input.snapScore,
          swag: 0,
          createdAt: Date.now(),
        };
        set({ me: card });
        try {
          await api.saveCard(card);
        } catch (err) {
          // Local-first: the card exists on device even if the sync fails.
          if (__DEV__) console.warn('[store] createMe sync failed:', err);
        }
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

        const event = events.find((e) => e.id === activeEventId);
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

      clearAwards: () => set({ lastAwards: null }),

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

      joinEvent: async (code) => {
        const event = await api.joinEventByCode(code);
        if (!event) return null;
        const existing = get().events.find((e) => e.id === event.id);
        set({
          events: existing ? get().events : [...get().events, event],
          activeEventId: event.id,
        });
        return event;
      },

      setActiveEvent: (eventId) => set({ activeEventId: eventId }),

      reset: () => set({ ...initial, hydrated: true }),
    }),
    {
      name: 'tag-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // `hydrated` and `lastAwards` are session state, never persisted.
      partialize: ({ me, tagged, events, activeEventId }) => ({
        me,
        tagged,
        events,
        activeEventId,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error && __DEV__) console.warn('[store] rehydrate failed:', error);
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

export const useActiveEvent = (): TagEvent | null => {
  const id = useTagStore((s) => s.activeEventId);
  const events = useTagStore((s) => s.events);
  return events.find((e) => e.id === id) ?? null;
};

/** Everything the recap card needs, derived rather than stored. */
export function useStats() {
  const tagged = useTagStore((s) => s.tagged);
  const me = useTagStore((s) => s.me);
  const events = useTagStore((s) => s.events);

  const people = Object.values(tagged);
  const byEvent = new Map<string, number>();
  for (const p of people) {
    for (const l of p.links) {
      if (l.eventName) byEvent.set(l.eventName, (byEvent.get(l.eventName) ?? 0) + 1);
    }
  }
  const topEvent = [...byEvent.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    swag: me?.swag ?? 0,
    people: people.length,
    scans: people.reduce((n, p) => n + p.links.length, 0),
    longestStreak: people.reduce((n, p) => Math.max(n, p.streak), 0),
    addedOnSnap: people.filter((p) => p.addedOnSnap).length,
    events: events.length,
    topEvent: topEvent ? { name: topEvent[0], tags: topEvent[1] } : null,
  };
}
