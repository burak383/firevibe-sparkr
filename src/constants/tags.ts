// Shared, curated tag pools - used by onboarding (VibeKurulumu.tsx) and the
// edit-profile screen (Profil.tsx) so a user always picks from the same
// fixed list in both places instead of typing free text. Free text meant
// two people could type "gece yürüyüşü" and "Gece Yürüyüşü" as "the same"
// tag and never actually match on it anywhere search/compatibility code
// compares tags by exact string.
export const MUSIC_TAGS = ['Alt Pop', 'Techno', 'Indie Rock', 'R&B', 'Arabesk'];

export const VIBE_TAG_OPTIONS = [
  'Gece Yürüyüşü',
  'Canlı Müzik',
  'Spontane Plan',
  'Kahve Sohbeti',
  'Sanat Gecesi',
  'Kitap Kulübü',
];

export const DEFAULT_VIBE_TAGS = ['Gece Yürüyüşü', 'Canlı Müzik', 'Spontane Plan'];
