const { getSwipeStatus, getSuperlikeStatus, hasActiveBoost } = require('./subscription');

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    contact: row.contact,
    age: row.age ?? null,
    birthDate: row.birthDate ?? null,
    bio: row.bio || '',
    city: row.city || 'İstanbul',
    neighbourhood: row.neighbourhood || '',
    // Once true, routes/users.js refuses to change city/neighbourhood again
    // (see buildPatch/applyLocationLock there) - the client uses this to
    // show the "Şehir"/"Semt" fields as read-only instead of editable.
    locationConfirmed: !!row.locationConfirmed,
    avatarUrl: row.avatarUrl || '',
    gallery: row.gallery || [],
    musicTags: row.musicTags || [],
    vibeTags: row.vibeTags || [],
    mood: row.mood || 'Chill',
    ageRangeMin: row.ageRangeMin ?? 22,
    ageRangeMax: row.ageRangeMax ?? 35,
    discoveryRadiusKm: row.discoveryRadiusKm ?? 12,
    voiceNoteUrl: row.voiceNoteUrl || '',
    verified: !!row.verified,
    isBot: !!row.isBot,
    onboardingComplete: !!row.onboardingComplete,
    phoneVerified: !!row.phoneVerified,
    visible: row.visible !== false,
    // Own-account only, default on - whether reading someone else's message
    // stamps `readAt` on it at all (see routes/messages.js's GET handler).
    // Nobody else's business what this is set to, same reasoning as
    // `visible`/`onboardingComplete` above.
    readReceiptsEnabled: row.readReceiptsEnabled !== false,
    distanceKm: row.distanceKm ?? 2.4,
    favoriteTrack: row.favoriteTrack || '',
    createdAt: row.createdAt,
    // Own-account only - how many free likes are left today and whether
    // premium is active. Not in toPublicProfile: nobody else needs to know
    // your subscription status.
    swipeStatus: getSwipeStatus(row),
    // Separate Super Vibe (superlike) allowance - 0/day free, 5/day premium.
    // See backend/src/subscription.js's consumeSuperlike/getSuperlikeStatus.
    superlikeStatus: getSuperlikeStatus(row),
    // Own-account only, same reasoning as swipeStatus/superlikeStatus - a
    // one-time "Boost" consumable purchase that puts you at the front of
    // everyone's discovery deck for 30 minutes. See
    // backend/src/subscription.js's hasActiveBoost/activateBoost.
    boostActive: hasActiveBoost(row),
    boostedUntil: row.boostedUntil || null,
  };
}

// Same shape as toPublicUser, minus fields that are nobody else's business:
// `contact` (raw phone/e-mail), `birthDate` (exact DOB - `age` already
// covers what other users should see), `phoneVerified`/`visible`/
// `onboardingComplete` (account-internal state, not profile content).
// Use this everywhere a user's data goes out to SOMEONE ELSE - the
// discovery deck, radar/nearby, a match's `otherUser`, the blocked-users
// list, and the single-profile lookup below. `toPublicUser` stays reserved
// for "this is the caller's own account" responses (register/login,
// /api/auth/me, /api/users/me).
function toPublicProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    age: row.age ?? null,
    bio: row.bio || '',
    city: row.city || 'İstanbul',
    neighbourhood: row.neighbourhood || '',
    avatarUrl: row.avatarUrl || '',
    gallery: row.gallery || [],
    musicTags: row.musicTags || [],
    vibeTags: row.vibeTags || [],
    mood: row.mood || 'Chill',
    voiceNoteUrl: row.voiceNoteUrl || '',
    verified: !!row.verified,
    isBot: !!row.isBot,
    distanceKm: row.distanceKm ?? 2.4,
    favoriteTrack: row.favoriteTrack || '',
    // Bumped (throttled) on every authenticated request by auth.js's
    // requireAuth - the mobile app derives "Aktif şimdi" / "X dk önce
    // aktifti" from this (see utils/presence.ts) instead of a hardcoded
    // label. Bots never actually authenticate, so they'd otherwise show as
    // permanently offline despite replying instantly - always report them
    // as active right now, matching how they behave everywhere else.
    lastActiveAt: row.isBot ? new Date().toISOString() : row.lastActiveAt || null,
  };
}

module.exports = { toPublicUser, toPublicProfile };
