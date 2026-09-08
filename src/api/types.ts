export interface User {
  id: number;
  name: string;
  contact: string;
  age: number | null;
  birthDate: string | null;
  bio: string;
  city: string;
  neighbourhood: string;
  // Once true, the backend refuses further city/neighbourhood changes (see
  // backend/src/routes/users.js's applyLocationLock) - RootNavigator uses
  // this to auto-request the real GPS location right after login while it's
  // false, and Profil.tsx uses it to switch "Şehir"/"Semt" to read-only.
  locationConfirmed: boolean;
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
  // Set by POST /api/users/me/verify-selfie ('pending') and cleared by an
  // admin's approve/reject in the /admin dashboard (backend/src/routes/admin.js) -
  // see SelfieDogrulama.tsx, which shows a different screen for each state
  // instead of always assuming a fresh selfie gets approved instantly.
  verificationStatus: 'none' | 'pending' | 'rejected';
  isBot: boolean;
  onboardingComplete: boolean;
  phoneVerified: boolean;
  visible: boolean;
  // "Okundu bilgisini kapat" setting (default true/on) - when off, your
  // chat screen never stamps `readAt` on messages you read, so the other
  // side never sees the colored "Okundu" tick for them. See
  // backend/src/routes/messages.js's GET handler.
  readReceiptsEnabled: boolean;
  distanceKm: number;
  favoriteTrack: string;
  createdAt: string;
  swipeStatus: SwipeStatus;
  superlikeStatus: SuperlikeStatus;
  // One-time "Boost" consumable purchase - puts you at the front of
  // everyone's discovery deck until `boostedUntil`. See
  // backend/src/subscription.js's hasActiveBoost/activateBoost.
  boostActive: boolean;
  boostedUntil: string | null;
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

// Separate Super Vibe (superlike) allowance - its own pool, NOT the same
// counter as SwipeStatus above. Free accounts always get limit 0/remaining
// 0; premium accounts get a hard cap of 5/day (not unlimited like regular
// likes). See backend/src/subscription.js's consumeSuperlike/getSuperlikeStatus.
export interface SuperlikeStatus {
  premium: boolean;
  limit: number;
  remaining: number;
  resetAt: string | null;
  // Purchased-pack balance (see backend/src/subscription.js's
  // addBonusSuperlikes) - spent only after the daily `remaining` above hits
  // 0, and the only way a free account (limit 0) ever gets a superlike.
  bonus: number;
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
  // Bumped (throttled) on the backend every authenticated request - null
  // means never seen active. See utils/presence.ts for turning this into an
  // "Aktif şimdi" / "X dk önce aktifti" label or an online dot.
  lastActiveAt: string | null;
}

export interface DeckUser extends PublicProfile {
  compatibility: number;
}

// A profile on the Beğenenler ("who liked you") / Beğeniler ("who you
// liked") screen - see backend/src/routes/discovery.js's
// /api/discovery/likes-received and /likes-sent, and screens/Begeniler.tsx.
export interface LikeEntry extends PublicProfile {
  compatibility: number;
  superlike: boolean;
  likedAt: string;
  // Only ever set on the "sent" list (likes-received always excludes
  // matches already, by design - see the backend route's comment) - whether
  // this like already turned into a mutual match.
  matched?: boolean;
}

// A profile on the "Görüntüleyenler" tab of the Beğeniler screen - see
// backend/src/routes/discovery.js's /api/discovery/profile-views. Same
// premium lock pattern as LikeEntry's "received" list.
export interface ProfileViewEntry extends PublicProfile {
  compatibility: number;
  viewedAt: string;
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
  // null until the recipient's chat screen has actually fetched this
  // message (see backend/src/routes/messages.js's GET handler) - drives the
  // "İletildi" (gray, not yet read) vs "Okundu" (colored, read) tick on your
  // own outgoing bubbles in DenizIleSohbet.tsx. Always null on messages you
  // received yourself - only your OWN sent messages ever show a tick.
  readAt: string | null;
}

export interface FireHour {
  windowStart: string;
  windowEnd: string;
  isLive: boolean;
  minutesToStart: number | null;
  minutesLeft: number | null;
  activeNearby: number;
}
