// Free-tier daily swipe (like/superlike) limit + premium subscription
// status.
//
// Premium has a SINGLE source of truth: `premiumExpiresAt`, an ISO
// timestamp compared against "now" in hasActivePremium() below. There is
// deliberately no separate on/off boolean - a boolean flag can drift out of
// sync with the real expiration (e.g. if a webhook event is missed), while
// "is this timestamp still in the future" can't. The only writer of this
// field is routes/subscription.js's RevenueCat webhook handler.
const db = require('./db');

const DAILY_FREE_SWIPES = 10;
const FREE_WINDOW_MS = 24 * 60 * 60 * 1000;

function hasActivePremium(user) {
  return !!(user.premiumExpiresAt && new Date(user.premiumExpiresAt).getTime() > Date.now());
}

// Read-only - lets the app show "X/10 kaldı" the moment the deck screen
// loads, before the user has swiped at all in the current window.
function getSwipeStatus(user) {
  if (hasActivePremium(user)) {
    return { premium: true, remaining: null, resetAt: null };
  }
  const now = Date.now();
  const resetAt = user.freeSwipesResetAt ? new Date(user.freeSwipesResetAt).getTime() : 0;
  if (!resetAt || resetAt <= now) {
    return { premium: false, remaining: DAILY_FREE_SWIPES, resetAt: null };
  }
  const used = user.freeSwipesUsed || 0;
  return {
    premium: false,
    remaining: Math.max(0, DAILY_FREE_SWIPES - used),
    resetAt: new Date(resetAt).toISOString(),
  };
}

// Call only for a 'like'/'superlike' swipe (see routes/discovery.js) -
// 'pass' never touches this, by design (only right-swipes are limited).
// Mutates + persists the user row when it allows the swipe through. Starts
// a fresh 24h window on the FIRST like/superlike after the previous window
// expired (or on this account's very first one) rather than resetting at a
// fixed clock time - a rolling per-user window, not a shared midnight reset.
function consumeFreeSwipe(user) {
  if (hasActivePremium(user)) {
    return { allowed: true, premium: true, remaining: null, resetAt: null };
  }
  const now = Date.now();
  let resetAt = user.freeSwipesResetAt ? new Date(user.freeSwipesResetAt).getTime() : 0;
  let used = user.freeSwipesUsed || 0;
  if (!resetAt || resetAt <= now) {
    used = 0;
    resetAt = now + FREE_WINDOW_MS;
  }
  if (used >= DAILY_FREE_SWIPES) {
    return { allowed: false, premium: false, remaining: 0, resetAt: new Date(resetAt).toISOString() };
  }
  used += 1;
  db.update('users', user.id, { freeSwipesUsed: used, freeSwipesResetAt: new Date(resetAt).toISOString() });
  return {
    allowed: true,
    premium: false,
    remaining: DAILY_FREE_SWIPES - used,
    resetAt: new Date(resetAt).toISOString(),
  };
}

module.exports = { DAILY_FREE_SWIPES, hasActivePremium, getSwipeStatus, consumeFreeSwipe };
