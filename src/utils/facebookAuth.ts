import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

// Same one-time setup Google's flow needs (see googleAuth.ts) - lets the
// auth session's browser popup close itself and hand control back to the
// app once the flow is done. Calling this twice (once from googleAuth.ts,
// once here) is harmless - it's idempotent.
WebBrowser.maybeCompleteAuthSession();

export const FACEBOOK_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || '';

/**
 * True once a Facebook App ID has been set (see mobile/.env.example). Until
 * then "Facebook ile devam et" shows a setup-instructions message instead of
 * attempting - and failing - a real sign-in.
 */
export const isFacebookSignInConfigured = Boolean(FACEBOOK_APP_ID);

// Facebook's "Valid OAuth Redirect URIs" setting only accepts real https://
// addresses - a bare custom scheme ("firevibe://") and even Facebook's own
// documented native-app pattern ("fb<APP_ID>://authorize") were both
// rejected by its validator. So the `redirect_uri` sent to Facebook has to
// be this backend's own address, byte-for-byte the same string entered in
// the Facebook app's "Valid OAuth Redirect URIs" list - NOT something built
// from EXPO_PUBLIC_API_URL, which points at localhost/LAN addresses during
// development that Facebook could never redirect to anyway.
const FACEBOOK_REDIRECT_URI = 'https://firevibe-sparkr-backend.onrender.com/api/auth/facebook/callback';

// The app's own custom scheme. This is NOT sent to Facebook - it's the URL
// prefix the in-app browser session (below) watches for to know the login
// flow is finished. The backend's GET /api/auth/facebook/callback route
// (see backend/src/routes/auth.js) receives Facebook's https redirect first
// and immediately re-redirects the browser here with the same query string
// attached - that second hop is what actually closes the browser and hands
// control back to this app.
const APP_REDIRECT_URI = 'firevibe://facebook-auth';

const AUTHORIZATION_ENDPOINT = 'https://www.facebook.com/v21.0/dialog/oauth';

function extractQueryParam(url: string, key: string): string | null {
  // Deliberately a plain regex instead of the URL/URLSearchParams globals -
  // both have had inconsistent polyfill support across React Native/Hermes
  // versions, and this only needs to pull one or two flat query values out
  // of a redirect URL.
  const match = url.match(new RegExp(`[?&]${key}=([^&]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export interface FacebookAuthResult {
  code: string;
  redirectUri: string;
}

/**
 * Runs the Facebook Login "Authorization Code" flow by hand, opening
 * Facebook's login dialog in an in-app browser session and resolving once
 * the person approves or cancels. Deliberately NOT built on
 * expo-auth-session's useAuthRequest/promptAsync (unlike googleAuth.ts) -
 * that convenience API only has room for a single redirect URI, but this
 * flow genuinely needs two different ones:
 *   - the `redirect_uri` sent to Facebook must be the backend's https
 *     address (the only kind its validator accepts)
 *   - the URL the browser session watches for, to know the flow is done and
 *     close itself, must be the app's own custom scheme (Facebook would
 *     otherwise just load the https callback as a normal web page and sit
 *     there)
 * The backend bridges the gap: GET /api/auth/facebook/callback takes
 * Facebook's https redirect and immediately 302s onward to the custom
 * scheme with the same `code` (or `error`) still attached.
 *
 * Returns `{ code, redirectUri }` on success - both get sent to
 * POST /api/auth/facebook, which exchanges the code for a token server-side
 * (see backend/src/facebook-verify.js) - or `null` if the person cancelled,
 * denied the request, or something went wrong.
 */
export async function promptFacebookLogin(): Promise<FacebookAuthResult | null> {
  if (!FACEBOOK_APP_ID) return null;

  const state = Crypto.randomUUID();
  const authUrl =
    `${AUTHORIZATION_ENDPOINT}?client_id=${encodeURIComponent(FACEBOOK_APP_ID)}` +
    `&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('public_profile,email')}` +
    `&state=${encodeURIComponent(state)}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, APP_REDIRECT_URI);
  if (result.type !== 'success' || !result.url) return null;

  const code = extractQueryParam(result.url, 'code');
  const returnedState = extractQueryParam(result.url, 'state');
  // Guards against a stale/forged redirect being replayed back at us - the
  // state we generated above must come back unchanged.
  if (!code || !returnedState || returnedState !== state) return null;

  return { code, redirectUri: FACEBOOK_REDIRECT_URI };
}
