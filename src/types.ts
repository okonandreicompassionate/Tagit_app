export type SocialKey = 'snap' | 'ig' | 'tiktok' | 'x' | 'whatsapp';

/** A person's shareable card. `snap` is the anchor — everything else is secondary. */
export type Card = {
  /** Stable id used in the QR payload. Immutable once created. */
  id: string;
  name: string;
  nickname?: string;
  bio?: string;
  avatar?: string;
  /** Handles keyed by platform. `snap` is required at onboarding. */
  socials: Partial<Record<SocialKey, string>>;
  /** Snap Score, pasted by the user — free social proof for this audience. */
  snapScore?: number;
  swag: number;
  createdAt: number;
};

/** A saved card plus the context of how you met — the part people forget. */
export type TaggedPerson = {
  card: Card;
  /** Every time you two scanned each other. Newest last. */
  links: LinkEvent[];
  streak: number;
  note?: string;
  /** Set when the user has actually opened Snapchat to add them. */
  addedOnSnap: boolean;
};

export type LinkEvent = {
  at: number;
  eventId?: string;
  eventName?: string;
  /** 'scanned' = you scanned them. 'scanned_by' = they scanned you. */
  direction: 'scanned' | 'scanned_by';
};

export type TagEvent = {
  id: string;
  name: string;
  code: string;
  joinedAt: number;
};

export type LeaderRow = {
  cardId: string;
  name: string;
  handle: string;
  avatar?: string;
  swag: number;
  tags: number;
};
