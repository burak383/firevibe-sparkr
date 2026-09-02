import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

// Wraps expo-apple-authentication for the "Apple ile devam et" button shown
// only on iOS (see Giri.tsx/KayTOl.tsx) - Sign in with Apple is an
// iOS/Apple-platform-only feature, there's no Android or web equivalent to
// fall back to the way Google's web client id does.
//
// CANNOT BE TESTED FROM THIS SANDBOX, AND WON'T RUN IN EXPO GO OR ON
// ANDROID: needs a development/production EAS build (same requirement as
// RevenueCat and Google Sign-In elsewhere in this project) running on a
// real iOS device or the iOS Simulator, signed into a real iCloud account.
// It also needs "Sign in with Apple" enabled as a capability on this app's
// identifier in the Apple Developer portal, which needs an actual Apple
// Developer Program membership - not set up yet for this project. See
// backend/src/apple-verify.js's header comment for the backend half.
//
// You'll need to run `npx expo install expo-apple-authentication` yourself
// (npm has no network access from this sandbox, so it can't be installed
// here), add the `expo-apple-authentication` config plugin entry to app.json
// (see its README), and set `usesAppleSignIn: true` under `ios` in app.json
// so EAS provisions the capability on your identifier automatically.

export const isAppleSignInAvailablePlatform = Platform.OS === 'ios';

/**
 * True only once the native module can actually be asked - still needs an
 * await, unlike the Google/Facebook "is configured" checks, because Apple's
 * own SDK is what decides this (iOS version, iCloud sign-in state, real
 * device vs an unsupported simulator config), not just an env var we set.
 * Returns false immediately (no native call at all) on Android/web.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (!isAppleSignInAvailablePlatform) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export interface AppleSignInResult {
  identityToken: string;
  // Only ever populated on someone's very FIRST authorization for this app -
  // Apple stops sending it on every later sign-in, same as the email
  // omission described in backend/src/apple-verify.js. Undefined thereafter.
  fullName?: string;
}

/**
 * Runs the real native "Sign in with Apple" sheet. Returns null on
 * cancellation (the person dismissed the sheet) rather than throwing -
 * callers should treat that the same as a cancelled Google/Facebook prompt
 * (just stop silently, no error banner).
 */
export async function promptAppleSignIn(): Promise<AppleSignInResult | null> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) return null;
    const fullName = credential.fullName
      ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ').trim()
      : '';
    return { identityToken: credential.identityToken, fullName: fullName || undefined };
  } catch (err: any) {
    // Apple's SDK throws (rather than resolving) when the person cancels -
    // ERR_REQUEST_CANCELED is its documented code for exactly that.
    if (err?.code === 'ERR_REQUEST_CANCELED') return null;
    throw err;
  }
}
