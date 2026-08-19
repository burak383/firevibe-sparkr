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
  };
}

module.exports = { toPublicUser };
