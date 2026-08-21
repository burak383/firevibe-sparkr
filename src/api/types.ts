export interface User {
  id: number;
  name: string;
  contact: string;
  age: number | null;
  birthDate: string | null;
  bio: string;
  city: string;
  neighbourhood: string;
  avatarUrl: string;
  gallery: string[];
  musicTags: string[];
  vibeTags: string[];
  mood: 'Chill' | 'Party' | 'Deep Talk' | 'Adrenaline';
  ageRangeMin: number;
  ageRangeMax: number;
  discoveryRadiusKm: number;
  voiceNoteUrl: string;
  verified: boolean;
  isBot: boolean;
  onboardingComplete: boolean;
  phoneVerified: boolean;
  visible: boolean;
  distanceKm: number;
  favoriteTrack: string;
  createdAt: string;
  swipeStatus: SwipeStatus;
}

// Free daily like/superlike allowance + premium status. Own-account only -
// nobody else's business, so this never appears on PublicProfile. `pass`
// swipes never touch this (unlimited by design); only a like/superlike
// draws it down. `remaining`/`resetAt` are null while premium is active
// (unlimited, nothing to count down). See backend/src/subscription.js.
export interface SwipeStatus {
  premium: boolean;
  remaining: number | null;
  resetAt: string | null;
}

// What the backend actually sends for someone ELSE's profile (discovery
// deck, radar/nearby, a match's `otherUser`, the blocked-users list, and
// GET /api/users/:id) - no `contact` (their phone/e-mail is nobody else's
// business), no `birthDate`/account-internal fields. Only `User` itself
// (your own account, from /api/auth/me or /api/users/me) carries the full
// shape. Keep this in sync with backend/src/serialize.js's toPublicProfile.
export interface PublicProfile {
  id: number;
  name: string;
  age: number | null;
  bio: string;
  city: string;
  neighbourhood: string;
  avatarUrl: string;
  gallery: string[];
  musicTags: string[];
  vibeTags: string[];
  mood: 'Chill' | 'Party' | 'Deep Talk' | 'Adrenaline';
  voiceNoteUrl: string;
  verified: boolean;
  isBot: boolean;
  distanceKm: number;
  favoriteTrack: string;
}

export interface DeckUser extends PublicProfile {
  compatibility: number;
}

export interface Match {
  id: number;
  compatibility: number;
  icebreaker: {
    question: string;
    answerMine: string;
    answerTheirs: string;
  };
  otherUser: PublicProfile;
  lastMessage: {
    text: string | null;
    imageUrl: string | null;
    createdAt: string;
    fromMe: boolean;
  } | null;
  createdAt: string;
}

export interface Message {
  id: number;
  matchId: number;
  senderId: number;
  text: string | null;
  imageUrl: string | null;
  createdAt: string;
}

export interface FireHour {
  windowStart: string;
  windowEnd: string;
  isLive: boolean;
  minutesToStart: number | null;
  minutesLeft: number | null;
  activeNearby: number;
}
