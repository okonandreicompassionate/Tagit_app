/**
 * Password hashing for real admin accounts — PBKDF2 via Web Crypto, same
 * reasoning as session.ts: Edge-Runtime-compatible, no extra dependency,
 * and this needs to be importable from anywhere session.ts already is
 * (middleware.ts included, even though it doesn't use this directly today).
 *
 * Stored format: `<iterations>.<hexSalt>.<hexHash>` — the iteration count
 * travels WITH the hash rather than living only in this file's constant, so
 * raising it later doesn't invalidate every password created under the old
 * count; verification always uses whatever count the stored hash itself
 * says it was created with.
 */

const ITERATIONS = 210_000; // OWASP's current PBKDF2-SHA256 floor, as of writing
const KEY_LENGTH_BITS = 256;

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function deriveHash(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_LENGTH_BITS
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(password, salt, ITERATIONS);
  return `${ITERATIONS}.${toHex(salt.buffer as ArrayBuffer)}.${toHex(hash)}`;
}

/**
 * Constant-time compare, same hand-rolled reasoning as session.ts's —
 * Web Crypto has no built-in equivalent of Node's timingSafeEqual.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * A validly-formatted hash nothing will ever match — used to run a real
 * PBKDF2 computation even when the email doesn't exist, so "wrong password"
 * and "no such account" take the same amount of time. Computed once from a
 * fixed salt/password that were never real credentials.
 */
export const DUMMY_HASH =
  '210000.00000000000000000000000000000000.' +
  '0000000000000000000000000000000000000000000000000000000000000000';

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [iterStr, saltHex, hashHex] = stored.split('.');
  const iterations = Number(iterStr);
  if (!iterations || !saltHex || !hashHex) return false;

  const salt = fromHex(saltHex);
  const computed = toHex(await deriveHash(password, salt, iterations));
  return constantTimeEqual(computed, hashHex);
}
