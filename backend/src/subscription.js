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

// Super Vibe (superlike) is a SEPARATE pool from the like/superlike swipe
// count above - free accounts get zero (0), premium accounts get a hard cap
// of 5/day rather than the old "unlimited on premium" behaviour that the
// shared pool gave them. Tracked on its own `superlikesUsed`/
// `superlikesResetAt` fields with the same rolling-24h-window shape as
// freeSwipesUsed/freeSwipesResetAt above.
const SUPERLIKE_DAILY_LIMIT_FREE = 0;
const SUPERLIKE_DAILY_LIMIT_PREMIUM = 5;

// "Boost" is a one-time consumable purchase (NOT a subscription) that puts a
// user at the front of everyone else's discovery deck for a fixed window.
// Same single-source-of-truth pattern as premium: `boostedUntil` is an ISO
// timestamp, hasActiveBoost() just checks whether it's still in the future.
// The only writer is routes/subscription.js's RevenueCat webhook handler,
// triggered by a NON_RENEWING_PURCHASE/INITIAL_PURCHASE event for the
// 'sparkr_boost_30min' product.
const BOOST_DURATION_MS = 30 * 60 * 1000;

// Extra Super Vibe pack: another one-time consumable purchase (not a
// subscription), available to free AND premium accounts alike - it's the
// only way a free account (whose daily limit is 0) ever gets to send a
// superlike without subscribing. Bought superlikes land in `bonusSuperlikes`,
// a plain count with no expiry or reset window, and consumeSuperlike() below
// draws from it only once the day's regular allowance (0 for free, 5/day for
// premium) is exhausted - so the free daily reset always gets used first.
const SUPERLIKE_PACK_SIZE = 5;

function hasActivePremium(user) {
  return !!(user.premiumExpiresAt && new Date(user.premiumExpiresAt).getTime() > Date.now());
}

function hasActiveBoost(user) {
  return !!(user.boostedUntil && new Date(user.boostedUntil).getTime() > Date.now());
}

// Activates (or extends) a boost. Back-to-back purchases stack: if a boost
// is already running, the new 30 minutes is added on top of the current
// expiry instead of restarting from now.
function activateBoost(user) {
  const base = hasActiveBoost(user) ? new Date(user.boostedUntil).getTime() : Date.now();
  const boostedUntil = new Date(base + BOOST_DURATION_MS).toISOString();
  db.update('users', user.id, { boostedUntil });
  user.boostedUntil = boostedUntil;
  return boostedUntil;
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

// Read-only - mirrors getSwipeStatus() above but for the separate Super
// Vibe pool. `limit` is included (unlike getSwipeStatus, where it's always
// the same DAILY_FREE_SWIPES constant) because it differs by tier here: 0
// for free, 5 for premium - the client needs it to render "X/5 kaldı".
// `bonus` is the purchased pack balance, shown/spent separately from the
// daily allowance - see consumeSuperlike below.
function getSuperlikeStatus(user) {
  const premium = hasActivePremium(user);
  const limit = premium ? SUPERLIKE_DAILY_LIMIT_PREMIUM : SUPERLIKE_DAILY_LIMIT_FREE;
  const bonus = user.bonusSuperlikes || 0;
  const now = Date.now();
  const resetAt = user.superlikesResetAt ? new Date(user.superlikesResetAt).getTime() : 0;
  if (!resetAt || resetAt <= now) {
    return { premium, limit, remaining: limit, resetAt: null, bonus };
  }
  const used = user.superlikesUsed || 0;
  return {
    premium,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: new Date(resetAt).toISOString(),
    bonus,
  };
}

// Call only for a 'superlike' swipe (see routes/discovery.js) - plain
// 'like'/'pass' never touch this, only consumeFreeSwipe's shared pool
// above. Draws from the day's regular allowance first (0 for free, 5/day
// premium, rolling-24h window same as consumeFreeSwipe); once that's
// exhausted (or for a free account, which never has any), falls back to
// spending one purchased pack superlike from `bonusSuperlikes` if any are
// left. Only denies outright when BOTH are empty.
function consumeSuperlike(user) {
  const premium = hasActivePremium(user);
  const limit = premium ? SUPERLIKE_DAILY_LIMIT_PREMIUM : SUPERLIKE_DAILY_LIMIT_FREE;
  const bonus = user.bonusSuperlikes || 0;
  const now = Date.now();
  let resetAt = user.superlikesResetAt ? new Date(user.superlikesResetAt).getTime() : 0;
  let used = user.superlikesUsed || 0;
  if (!resetAt || resetAt <= now) {
    used = 0;
    resetAt = now + FREE_WINDOW_MS;
  }

  if (limit > 0 && used < limit) {
    used += 1;
    db.update('users', user.id, { superlikesUsed: used, superlikesResetAt: new Date(resetAt).toISOString() });
    return {
      allowed: true,
      premium,
      limit,
      remaining: limit - used,
      resetAt: new Date(resetAt).toISOString(),
      bonus,
    };
  }

  if (bonus > 0) {
    const newBonus = bonus - 1;
    db.update('users', user.id, { bonusSuperlikes: newBonus });
    return {
      allowed: true,
      premium,
      limit,
      remaining: Math.max(0, limit - used),
      resetAt: limit > 0 ? new Date(resetAt).toISOString() : null,
      bonus: newBonus,
    };
  }

  return {
    allowed: false,
    premium,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: limit > 0 ? new Date(resetAt).toISOString() : null,
    bonus,
  };
}

// Credits a purchased Super Vibe pack (called from routes/subscription.js's
// RevenueCat webhook on a 'sparkr_superlike_pack_5' purchase event) - simply
// adds on top of whatever balance is already there, no expiry.
function addBonusSuperlikes(user, count) {
  const newBonus = (user.bonusSuperlikes || 0) + count;
  db.update('users', user.id, { bonusSuperlikes: newBonus });
  user.bonusSuperlikes = newBonus;
  return newBonus;
}

module.exports = {
  DAILY_FREE_SWIPES,
  hasActivePremium,
  getSwipeStatus,
  consumeFreeSwipe,
  SUPERLIKE_DAILY_LIMIT_FREE,
  SUPERLIKE_DAILY_LIMIT_PREMIUM,
  getSuperlikeStatus,
  consumeSuperlike,
  BOOST_DURATION_MS,
  hasActiveBoost,
  activateBoost,
  SUPERLIKE_PACK_SIZE,
  addBonusSuperlikes,
};
