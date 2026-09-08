import type { Card, LeaderRow, TagEvent } from '../types';

/**
 * Fixtures for development and tests only.
 *
 * These used to double as a no-backend fallback, which became a liability the
 * moment a real backend existed: five invented people looked exactly like real
 * users. Everything below is now gated behind `__DEV__`, so a release build
 * shows an honest empty state instead of strangers who don't exist.
 */
const DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : true;
const card = (
  id: string,
  name: string,
  nickname: string,
  socials: Card['socials'],
  snapScore: number,
  swag: number
): Card => ({ id, name, nickname, socials, snapScore, swag, createdAt: Date.now() });

const DEMO_CARDS: Card[] = [
  card('bigsho', 'Oluwaseun Adebayo', 'Sho', { snap: 'bigsho_', ig: 'bigsho', tiktok: 'bigsho' }, 284_500, 1240),
  card('tolu', 'Toluwani Ige', 'Tolu', { snap: 'toluu', ig: 'tolu.ige', whatsapp: '+2348012345678' }, 96_300, 480),
  card('zeek', 'Ezekiel Nnamdi', 'Zeek', { snap: 'zeekk', x: 'zeeknnamdi' }, 41_900, 130),
  card('amaka', 'Amaka Obi', 'Ams', { snap: 'amaka.o', ig: 'ams_bakes' }, 172_000, 760),
  card('dami', 'Damilare Cole', 'Dee', { snap: 'deecole', ig: 'dee.shot', tiktok: 'deecole' }, 58_400, 310),
];

const DAY = 86_400_000;
const soon = (days: number, hour = 20) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

const event = (e: Partial<TagEvent> & Pick<TagEvent, 'id' | 'name' | 'type'>): TagEvent => ({
  visibility: 'public',
  boostScore: 0,
  sponsored: false,
  attendeeCount: 0,
  createdAt: Date.now(),
  ...e,
});

const DEMO_EVENTS: TagEvent[] = [
  event({
    id: 'evt_flytime',
    name: 'Flytime Fest',
    code: 'FLYTIME',
    type: 'concert',
    description: 'Three nights, main stage. Lagos in December.',
    location: 'Eko Convention Centre',
    city: 'Lagos',
    startsAt: soon(3, 19),
    ticketUrl: 'https://flytime.example/tickets',
    sponsored: true,
    attendeeCount: 412,
  }),
  event({
    id: 'evt_unilag',
    name: 'Unilag Freshers Week',
    code: 'UNILAG26',
    type: 'party',
    location: 'Unilag Main Campus',
    city: 'Lagos',
    startsAt: soon(1, 18),
    attendeeCount: 128,
    boostScore: 250,
    boostedUntil: Date.now() + 2 * DAY,
  }),
  event({
    id: 'evt_techfest',
    name: 'Lagos Tech Fest',
    code: 'LTF26',
    type: 'meetup',
    description: 'Founders, engineers, and far too much coffee.',
    location: 'Landmark Centre',
    city: 'Lagos',
    startsAt: soon(9, 10),
    ticketUrl: 'https://ltf.example/tickets',
    attendeeCount: 64,
  }),
  event({
    id: 'evt_popup',
    name: 'Thrift Pop-Up',
    type: 'popup',
    location: 'Freedom Park',
    city: 'Lagos',
    startsAt: soon(5, 12),
    attendeeCount: 22,
  }),
  event({
    id: 'evt_abuja',
    name: 'Abuja Rooftop Set',
    type: 'party',
    location: 'Transcorp Rooftop',
    city: 'Abuja',
    startsAt: soon(6, 21),
    attendeeCount: 47,
  }),
];

const DEMO_LEADERBOARD: LeaderRow[] = [
  { cardId: 'bigsho', name: 'Sho', handle: 'bigsho_', swag: 1240, tags: 84 },
  { cardId: 'amaka', name: 'Ams', handle: 'amaka.o', swag: 760, tags: 51 },
  { cardId: 'tolu', name: 'Tolu', handle: 'toluu', swag: 480, tags: 39 },
  { cardId: 'dami', name: 'Dee', handle: 'deecole', swag: 310, tags: 24 },
  { cardId: 'zeek', name: 'Zeek', handle: 'zeekk', swag: 130, tags: 11 },
];



/* ---------- what the app actually imports ---------- */

// Empty in a release build. An empty list renders the real "nothing here yet"
// state, which is true; a populated one would be a lie.
export const MOCK_CARDS: Card[] = DEV ? DEMO_CARDS : [];
export const MOCK_EVENTS: TagEvent[] = DEV ? DEMO_EVENTS : [];
export const MOCK_LEADERBOARD: LeaderRow[] = DEV ? DEMO_LEADERBOARD : [];

export const findMockCard = (id: string) =>
  MOCK_CARDS.find((c) => c.id.toLowerCase() === id.toLowerCase()) ?? null;

export const findMockEvent = (code: string) =>
  MOCK_EVENTS.find((e) => e.code?.toLowerCase() === code.trim().toLowerCase()) ?? null;
