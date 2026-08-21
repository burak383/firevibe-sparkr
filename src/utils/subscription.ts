import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

// Wraps RevenueCat (react-native-purchases) for the "Premium" subscription
// that removes the daily free-swipe limit (see backend/src/subscription.js
// and src/screens/Premium.tsx).
//
// CANNOT BE TESTED FROM THIS SANDBOX, AND WON'T RUN IN EXPO GO:
// react-native-purchases needs native code, so it requires a development
// build (`eas build --profile development`) - same requirement as Google
// Sign-In and push notifications elsewhere in this project. Beyond that,
// nothing here can work at all until a real RevenueCat project exists and
// is linked to real App Store Connect / Google Play Console apps with a
// subscription product configured (69,9 TL). This file follows RevenueCat's
// documented API (https://www.revenuecat.com/docs/getting-started/quickstart)
// as closely as possible, but treat it as unverified until tried on a real
// device with a real RevenueCat project.
//
// You'll need to run `npx expo install react-native-purchases` yourself
// (npm has no network access from this sandbox, so it can't be installed
// here) and set EXPO_PUBLIC_REVENUECAT_IOS_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
// in your .env once you've created a RevenueCat project (Project Settings ->
// API Keys - these are public, safe-to-ship keys, unlike your JWT secret).

const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || '';
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || '';

// Must match the entitlement identifier you create in the RevenueCat
// dashboard for the 69,9 TL subscription product.
export const PREMIUM_ENTITLEMENT_ID = 'premium';

let configured = false;

// Call once per app session, right after the user is authenticated (see
// RootNavigator.tsx). `Purchases.logIn` ties RevenueCat's own subscriber
// identity to OUR backend's numeric user id - that id is what ends up in
// the webhook's `event.app_user_id` (see backend/src/routes/subscription.js),
// which is how the backend knows WHICH user just subscribed. Without this
// call, RevenueCat would use its own anonymous device-based id instead, and
// the webhook would have no way to match it back to an account here.
export async function configurePurchases(userId: number): Promise<void> {
  try {
    const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
    if (!apiKey) {
      console.log('[subscription] No RevenueCat API key set yet - skipping configure.');
      return;
    }
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
    if (!configured) {
      Purchases.configure({ apiKey });
      configured = true;
    }
    await Purchases.logIn(String(userId));
  } catch (err) {
    // Expected in Expo Go (no native module there at all) and before a
    // RevenueCat project/key exists - fail silently rather than surfacing a
    // scary error for something the user can't act on from inside the app.
    console.log('[subscription] configurePurchases skipped:', err instanceof Error ? err.message : err);
  }
}

// Returns the current default "offering" (RevenueCat's term for a set of
// purchasable packages) - null if none is configured yet in the dashboard.
export async function getPremiumOffering(): Promise<PurchasesOffering | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

export function isPremiumActive(customerInfo: CustomerInfo): boolean {
  return typeof customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== 'undefined';
}

// Runs the real purchase flow (shows the platform's native payment sheet).
// Returns whether the "premium" entitlement is active immediately after -
// RevenueCat validates the purchase with Apple/Google itself, so this
// reflects a REAL confirmed purchase, not just "the sheet closed".
export async function purchasePremium(pkg: PurchasesPackage): Promise<boolean> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return isPremiumActive(customerInfo);
}

// For "I already paid on my other device" / reinstalling the app.
export async function restorePurchases(): Promise<boolean> {
  const customerInfo = await Purchases.restorePurchases();
  return isPremiumActive(customerInfo);
}
