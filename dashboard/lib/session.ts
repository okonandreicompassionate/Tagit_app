/**
 * The admin session, as a signed cookie value.
 *
 * Deliberately not a JWT library or a database session table — this gates one
 * shared password for a small team, not a multi-user auth system. A JWT would
 * add a dependency and a set of standard-but-irrelevant claims for what is
 * really just "prove you know SESSION_SECRET, and do it before this expires."
 *
 * Built on the Web Crypto API (`crypto.subtle`), not Node's `crypto` module.
 * This file is imported by middleware.ts, which runs on the Edge Runtime —
 * Edge has no access to `node:crypto` at all, and bundling it fails the build
 * outright. Web Crypto is available in both the Edge Runtime and modern
 * Node, so one implementation works everywhere this file is imported.
 *
 * Format: `<expiresAtMs>.<hexHmac>`. The HMAC covers the expiry, so a client
 * cannot extend its own session by editing the timestamp.
 */

const COOKIE_NAME = 'tagit_admin_session';
const SESSION_HOURS = 12;

function requireSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'SESSION_SECRET is missing or too short. Generate one with: ' +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  return s;
}

// Cached per secret value: importKey is the expensive step, and the secret
// only ever changes with a redeploy.
let cachedKey: CryptoKey | null = null;
let cachedFor: string | null = null;

async function hmacKey(): Promise<CryptoKey> {
  const secret = requireSecret();
  if (cachedKey && cachedFor === secret) return cachedKey;

  cachedKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  cachedFor = secret;
  return cachedKey;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sign(payload: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toHex(sig);
}

/** Builds a fresh, valid session token. Called only after the password check. */
export async function createSessionToken(): Promise<string> {
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = String(expiresAt);
  return `${payload}.${await sign(payload)}`;
}

/**
 * Constant-time string compare. Web Crypto has no built-in equivalent of
 * Node's `timingSafeEqual`, so this does the same thing by hand: walk every
 * character regardless of where a mismatch is, so how long the check takes
 * never reveals how much of the guess was right.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifies a token from the cookie. */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return false;

  const expected = await sign(payload);
  if (!constantTimeEqual(mac, expected)) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

export { COOKIE_NAME, SESSION_HOURS };
