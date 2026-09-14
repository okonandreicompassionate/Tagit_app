/**
 * The admin session, as a signed cookie value.
 *
 * Built on the Web Crypto API (`crypto.subtle`), not Node's `crypto` module.
 * This file is imported by middleware.ts, which runs on the Edge Runtime —
 * Edge has no access to `node:crypto` at all, and bundling it fails the build
 * outright. Web Crypto is available in both the Edge Runtime and modern
 * Node, so one implementation works everywhere this file is imported.
 *
 * Format: `<base64url(JSON payload)>.<hexHmac>`. The HMAC covers the whole
 * payload — id, email, role, expiry — so a client can't edit any of it
 * (extend its own session, or hand itself the `god` role) without
 * invalidating the signature.
 *
 * No `Buffer` here on purpose (also an Edge-Runtime constraint) — base64url
 * encode/decode goes through `btoa`/`atob`, which exist in both Edge and
 * modern Node, wrapped to survive UTF-8 (`email` isn't guaranteed ASCII).
 */

export type AdminRole = 'admin' | 'god';
export type AdminSession = { adminId: string; email: string; role: AdminRole; expiresAt: number };

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

function toBase64Url(str: string): string {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  return decodeURIComponent(escape(atob(b64)));
}

/** Builds a fresh, valid session token. Called only after the password check. */
export async function createSessionToken(admin: {
  id: string;
  email: string;
  role: AdminRole;
}): Promise<string> {
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = toBase64Url(
    JSON.stringify({ adminId: admin.id, email: admin.email, role: admin.role, expiresAt })
  );
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

/** Verifies a token from the cookie. Returns the session it carries, or null. */
export async function verifySessionToken(token: string | undefined | null): Promise<AdminSession | null> {
  if (!token) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;

  const expected = await sign(payload);
  if (!constantTimeEqual(mac, expected)) return null;

  try {
    const data = JSON.parse(fromBase64Url(payload)) as Partial<AdminSession>;
    if (!data.adminId || !data.email || !data.role || !data.expiresAt) return null;
    if (Date.now() >= data.expiresAt) return null;
    return data as AdminSession;
  } catch {
    return null;
  }
}

export { COOKIE_NAME, SESSION_HOURS };
