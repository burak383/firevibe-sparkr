import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

// Native Google Sign-In (Google Play Services) instead of the old
// browser-based expo-auth-session flow. No redirect URI / custom URI
// scheme to configure in Google Cloud Console anymore - Android identity is
// resolved automatically from this app's package name + signing
// certificate (SHA-1), which must be registered on the "SparkR Android"
// OAuth client (see mobile/.env.example). Only the Web client ID is passed
// here: Google always issues the ID token addressed to it, regardless of
// which platform client the sign-in happened through.
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

/**
 * True once the Web client ID has been set (see mobile/.env.example). Until
 * then "Google ile devam et" shows a setup-instructions message instead of
 * attempting - and failing - a real sign-in.
 */
export const isGoogleSignInConfigured = Boolean(GOOGLE_WEB_CLIENT_ID);

let hasConfigured = false;

function ensureConfigured() {
  if (hasConfigured || !isGoogleSignInConfigured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    offlineAccess: false,
    scopes: ['profile', 'email'],
  });
  hasConfigured = true;
}

/**
 * Runs the native Google Sign-In flow (Play Services account picker, no
 * browser involved) and resolves to the ID token to send to the backend
 * (`POST /api/auth/google`), or `null` if the user cancelled. Throws on a
 * real failure (no Play Services, network error, misconfigured client) -
 * callers should catch this the same way they already catch ApiError from
 * the backend call (see Giri.tsx / KayTOl.tsx).
 */
export async function promptGoogleSignIn(): Promise<string | null> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null; // user cancelled the picker
  return response.data.idToken;
}
