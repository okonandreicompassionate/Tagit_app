import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

/**
 * Snapchat Login Kit — real OAuth2, not the scraping in snapchat.ts.
 *
 * Login Kit was an SDK that wrapped OAuth2 with a drop-in button; that SDK
 * is being deprecated in favour of implementing the OAuth2 service
 * directly (https://developers.snap.com/snap-kit/login-kit/overview,
 * confirmed live 2026-09-14). A native React Native SDK
 * (@snapchat/snap-kit-react-native) also exists, but it requires linking a
 * native module beyond what an Expo config plugin cleanly covers — the
 * plain OAuth2 + PKCE flow below needs nothing but expo-auth-session,
 * which is already the Expo-blessed way to talk to a third-party OAuth
 * provider from a managed app.
 *
 * What this can and can't replace: the available scopes are display name,
 * Bitmoji avatar, and an opaque per-app external id — NEVER the person's
 * actual Snapchat handle (confirmed against Snap's own scope table). This
 * only ever replaces snapchat.ts's scraped-display-name lookup; the
 * handle field in onboarding still has to be typed by hand, same as today.
 */

const CLIENT_ID = process.env.EXPO_PUBLIC_SNAP_CLIENT_ID;

/** False until EXPO_PUBLIC_SNAP_CLIENT_ID is set — every call site should
 * check this before rendering a "Continue with Snapchat" button at all,
 * rather than rendering one that's guaranteed to fail. */
export const SNAP_LOGIN_AVAILABLE = Boolean(CLIENT_ID);

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.snapchat.com/accounts/oauth2/auth',
  tokenEndpoint: 'https://accounts.snapchat.com/accounts/oauth2/token',
};

const SCOPES = [
  'https://auth.snapchat.com/oauth2/api/user.display_name',
  'https://auth.snapchat.com/oauth2/api/user.bitmoji.avatar',
];

export type SnapProfile = {
  displayName?: string;
  bitmojiAvatarUrl?: string;
};

/**
 * Best-effort profile fetch after a successful token exchange. The query
 * shape (`{me{displayName, bitmoji{avatar}}}`) is confirmed against Snap's
 * own SDK reference docs, but the raw endpoint below is inferred from how
 * their JS/native SDKs are documented to behave, not from a first-party
 * "raw HTTP" doc page — Snap's own guide for the plain-OAuth2 integration
 * (as opposed to the SDK) doesn't publish this call directly. Wrapped in
 * try/catch and never blocks login on failure, same posture as the
 * scraping calls in snapchat.ts: an unofficial call that fails soft.
 */
async function fetchProfile(accessToken: string): Promise<SnapProfile> {
  try {
    const res = await fetch('https://kit.snapchat.com/v1/me', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query: '{me{displayName, bitmoji{avatar}}}' }),
    });
    if (!res.ok) return {};
    const body = await res.json();
    const me = body?.data?.me;
    return {
      displayName: typeof me?.displayName === 'string' ? me.displayName : undefined,
      bitmojiAvatarUrl: typeof me?.bitmoji?.avatar === 'string' ? me.bitmoji.avatar : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Opens Snapchat's login, exchanges the code (PKCE — no client secret,
 * safe to run entirely on-device), and returns whatever profile fields the
 * scopes above unlock. Returns null on cancel, denial, or if no client id
 * is configured — never throws, so a call site can treat it exactly like
 * the "user cancelled" case without a separate error path.
 */
export async function loginWithSnapchat(): Promise<SnapProfile | null> {
  if (!CLIENT_ID) return null;

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'tagit', path: 'snap-auth' });

  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    scopes: SCOPES,
    redirectUri,
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) return null;

  try {
    const tokenResult = await AuthSession.exchangeCodeAsync(
      {
        clientId: CLIENT_ID,
        code: result.params.code,
        redirectUri,
        extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
      },
      discovery
    );
    if (!tokenResult.accessToken) return null;
    return await fetchProfile(tokenResult.accessToken);
  } catch {
    // Token exchange failed — offline, expired code, provider hiccup.
    // Same rule as everywhere else this app touches Snapchat: never block
    // someone finishing onboarding over it.
    return null;
  }
}
