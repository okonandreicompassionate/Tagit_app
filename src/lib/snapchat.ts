/**
 * What Snapchat actually lets a third party do.
 *
 * There is no API for Snap Score or follower/friend counts — Snap has never
 * exposed either, and Login Kit's scopes are limited to display name, Bitmoji
 * avatar and an opaque id (notably *not* the username, which is the one field
 * this app needs). So Snap Score stays a self-reported number on the card.
 *
 * These two things are real, public, and need no key:
 *
 *  1. `snapchat.com/add/<handle>` returns 200 for a real account and 404 for
 *     one that doesn't exist — which is how we catch a mistyped handle before
 *     it silently breaks the app's core action.
 *  2. `app.snapchat.com/web/deeplink/snapcode` renders anyone's genuine
 *     Snapcode, Bitmoji included. It's the endpoint Snapchat's own "add me"
 *     web widgets use.
 *
 * Both are undocumented web endpoints rather than a versioned API, so every
 * function here fails soft: a network problem or a changed page must never
 * block someone from finishing onboarding.
 */

export const cleanHandle = (h: string) =>
  h.trim().replace(/^@+/, '').replace(/\s+/g, '').toLowerCase();

/** Snapchat usernames: 3-15 chars, letters/digits/._- , must start with a letter. */
export const looksLikeHandle = (h: string) => /^[a-z][a-z0-9._-]{2,14}$/.test(cleanHandle(h));

/**
 * Their real Snapcode as a PNG. Scannable by Snapchat itself, so it works for
 * someone who doesn't have Tag installed.
 */
export function snapcodeUrl(handle: string, size = 300): string {
  const u = encodeURIComponent(cleanHandle(handle));
  return `https://app.snapchat.com/web/deeplink/snapcode?username=${u}&type=PNG&bitmoji=enable&size=${size}`;
}

export const snapProfileUrl = (handle: string) =>
  `https://www.snapchat.com/add/${encodeURIComponent(cleanHandle(handle))}`;

export type HandleCheck =
  /** The account exists. `displayName` is best-effort. */
  | { status: 'valid'; displayName?: string }
  /** Snapchat says no such account — almost always a typo. */
  | { status: 'not-found' }
  /** Couldn't tell: offline, timed out, or the page changed shape. */
  | { status: 'unknown' };

/**
 * Best-effort display name. Deliberately tries several shapes and gives up
 * quietly — the page is not a contract, and a missing name is not an error.
 */
export function parseDisplayName(html: string, handle: string): string | undefined {
  const patterns = [
    /"displayName"\s*:\s*"([^"]{1,60})"/,
    /"display_name"\s*:\s*"([^"]{1,60})"/,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,80})["']/i,
    /<title>([^<]{1,80})<\/title>/i,
  ];

  for (const re of patterns) {
    const raw = html.match(re)?.[1];
    if (!raw) continue;

    const name = raw
      // Strip the site's own furniture and the "(@handle)" suffix.
      .replace(/\s*[|·—-]\s*Snapchat\s*$/i, '')
      .replace(/\s+on\s+Snapchat\s*$/i, '')
      .replace(/\s*\(@[^)]+\)\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Reject the generic page title and bare echoes of the handle.
    // Compare without collapsing whitespace: cleanHandle() strips spaces, so
    // "Team Snapchat" would otherwise look identical to the handle
    // "teamsnapchat" and a perfectly good name would be thrown away — handles
    // are usually derived from names, so that case is the common one.
    if (!name) continue;
    if (/^snapchat$/i.test(name)) continue;
    if (name.toLowerCase() === cleanHandle(handle)) continue;
    return name.slice(0, 60);
  }
  return undefined;
}

/**
 * Checks a handle against Snapchat's public profile page.
 * `timeoutMs` keeps onboarding responsive on a bad connection.
 */
export async function verifyHandle(handle: string, timeoutMs = 6000): Promise<HandleCheck> {
  if (!looksLikeHandle(handle)) return { status: 'not-found' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(snapProfileUrl(handle), {
      signal: controller.signal,
      headers: { Accept: 'text/html' },
    });

    if (res.status === 404) return { status: 'not-found' };
    if (!res.ok) return { status: 'unknown' };

    const html = await res.text();
    return { status: 'valid', displayName: parseDisplayName(html, handle) };
  } catch {
    // Aborted, offline, or blocked — never a reason to stop the user.
    return { status: 'unknown' };
  } finally {
    clearTimeout(timer);
  }
}
