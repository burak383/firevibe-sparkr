const { getSwipeStatus } = require('./subscription');

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
    distanceKm: row.distanceKm ?? 2.4,
    favoriteTrack: row.favoriteTrack || '',
    createdAt: row.createdAt,
    // Own-account only - how many free likes are left today and whether
    // premium is active. Not in toPublicProfile: nobody else needs to know
    // your subscription status.
    swipeStatus: getSwipeStatus(row),
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
  };
}

module.exports = { toPublicUser, toPublicProfile };
