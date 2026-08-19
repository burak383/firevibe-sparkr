import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

// Required once per app so the auth session's browser popup can close
// itself and hand control back to the app after Google redirects.
WebBrowser.maybeCompleteAuthSession();

export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
export const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

/**
 * True once at least one Google OAuth client ID has been set (see
 * mobile/.env.example). Until then "Google ile devam et" shows a
 * setup-instructions message instead of attempting - and failing - a real
 * sign-in.
 */
export const isGoogleSignInConfigured = Boolean(
  GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID
);

/**
 * Thin wrapper around expo-auth-session's Google provider. Returns the same
 * [request, response, promptAsync] tuple - call promptAsync() from a button
 * press, then read the ID token off `response` once it resolves to
 * 'success' (see Giri.tsx for the pattern; the exact field the token lands
 * in - `authentication.idToken` vs `params.id_token` - depends on the
 * provider version, so callers should check both).
 */
export function useGoogleAuthRequest() {
  return Google.useAuthRequest({
       iosClientId: GOOGLE_IOS_CLIENT_ID || 'not-configured',
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || 'not-configured',
    webClientId: GOOGLE_WEB_CLIENT_ID || 'not-configured',
    scopes: ['profile', 'email'],
  });
}

// Typed as `any` deliberately: the exact shape of the auth-session response
// object has shifted across expo-auth-session versions, and this whole flow
// can only be verified against a real Google OAuth client (see
// mobile/.env.example), which this sandbox doesn't have.
export function extractGoogleIdToken(response: any): string | null {
  if (!response || response.type !== 'success') return null;
  return response.authentication?.idToken || response.params?.id_token || null;
}
