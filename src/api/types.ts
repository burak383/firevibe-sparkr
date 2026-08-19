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
}

export interface DeckUser extends User {
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
  otherUser: User;
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
