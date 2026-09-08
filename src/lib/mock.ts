import type { Card, LeaderRow, TagEvent } from '../types';

/**
 * Seed directory so the app is fully usable with no backend — you can scan a
 * friend's code, or hit "demo scan" in dev, and get a real card back.
 * Replace by setting EXPO_PUBLIC_SUPABASE_URL (see src/lib/api.ts).
 */
const card = (
  id: string,
  name: string,
  nickname: string,
  bio: string,
  socials: Card['socials'],
  snapScore: number,
  swag: number
): Card => ({ id, name, nickname, bio, socials, snapScore, swag, createdAt: Date.now() });

export const MOCK_CARDS: Card[] = [
  card('bigsho', 'Oluwaseun Adebayo', 'Sho', 'Prod music. Lagos ↔ Abuja.', { snap: 'bigsho_', ig: 'bigsho', tiktok: 'bigsho' }, 284_500, 1240),
  card('tolu', 'Toluwani Ige', 'Tolu', 'Fashion. Thrift plug.', { snap: 'toluu', ig: 'tolu.ige', whatsapp: '+2348012345678' }, 96_300, 480),
  card('zeek', 'Ezekiel Nnamdi', 'Zeek', 'Ball is life 🏀', { snap: 'zeekk', x: 'zeeknnamdi' }, 41_900, 130),
  card('amaka', 'Amaka Obi', 'Ams', 'Med student. Sells cakes on the side.', { snap: 'amaka.o', ig: 'ams_bakes' }, 172_000, 760),
  card('dami', 'Damilare Cole', 'Dee', 'Photographer. DM for shoots.', { snap: 'deecole', ig: 'dee.shot', tiktok: 'deecole' }, 58_400, 310),
];

export const MOCK_EVENTS: TagEvent[] = [
  { id: 'evt_flytime', name: 'Flytime Fest', code: 'FLYTIME', joinedAt: Date.now() },
  { id: 'evt_unilag', name: 'Unilag Freshers Week', code: 'UNILAG26', joinedAt: Date.now() },
  { id: 'evt_techfest', name: 'Lagos Tech Fest', code: 'LTF26', joinedAt: Date.now() },
];

export const MOCK_LEADERBOARD: LeaderRow[] = [
  { cardId: 'bigsho', name: 'Sho', handle: 'bigsho_', swag: 1240, tags: 84 },
  { cardId: 'amaka', name: 'Ams', handle: 'amaka.o', swag: 760, tags: 51 },
  { cardId: 'tolu', name: 'Tolu', handle: 'toluu', swag: 480, tags: 39 },
  { cardId: 'dami', name: 'Dee', handle: 'deecole', swag: 310, tags: 24 },
  { cardId: 'zeek', name: 'Zeek', handle: 'zeekk', swag: 130, tags: 11 },
];

export const findMockCard = (id: string) =>
  MOCK_CARDS.find((c) => c.id.toLowerCase() === id.toLowerCase()) ?? null;

export const findMockEvent = (code: string) =>
  MOCK_EVENTS.find((e) => e.code.toLowerCase() === code.trim().toLowerCase()) ?? null;
