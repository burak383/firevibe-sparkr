import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DeckUser, FireHour, Match, Message, PublicProfile, SwipeStatus, User } from './types';

// Point this at your backend. For a physical device or Android emulator,
// `localhost` won't reach your computer - set EXPO_PUBLIC_API_URL in a `.env`
// file at the project root instead (see mobile/README.md).
const DEFAULT_BASE_URL = 'http://localhost:4000';
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

const TOKEN_KEY = 'firevibe:token';

let cachedToken: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      `Sunucuya bağlanılamadı (${API_BASE_URL}). Backend'in çalıştığından ve adresin doğru olduğundan emin ol.`,
      0
    );
  }

  let data: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) ||
      'Bir şeyler ters gitti.';
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export const api = {
  register: (payload: { name: string; birthDate: string; contact: string; password: string }) =>
    request<{ token: string; user: User }>('/api/auth/register', { method: 'POST', body: payload, auth: false }),

  login: (payload: { identifier: string; password: string }) =>
    request<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: payload, auth: false }),

  forgotPassword: (contact: string) =>
    request<{ ok: boolean; message: string; devResetToken?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: { contact },
      auth: false,
    }),

  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: { token, password },
      auth: false,
    }),

  me: () => request<{ user: User }>('/api/auth/me'),

  updateMe: (patch: Record<string, unknown>) => request<{ user: User }>('/api/users/me', { method: 'PUT', body: patch }),

  vibeSetup: (patch: Record<string, unknown>) =>
    request<{ user: User }>('/api/users/me/vibe-setup', { method: 'POST', body: patch }),

  deleteAccount: () => request<{ ok: boolean }>('/api/users/me', { method: 'DELETE' }),

  // See SelfieDogrulama.tsx - `selfieUrl` comes from takeAndUploadSelfie(),
  // which forces the front camera rather than the photo library.
  verifySelfie: (selfieUrl: string) =>
    request<{ user: User }>('/api/users/me/verify-selfie', { method: 'POST', body: { selfieUrl } }),

  deck: () => request<{ deck: DeckUser[] }>('/api/discovery/deck'),

  // `swipeStatus` is only populated for 'like'/'superlike' (a 'pass' never
  // touches the daily limit at all, so the backend sends null for it) - see
  // backend/src/routes/discovery.js.
  swipe: (targetUserId: number, action: 'like' | 'pass' | 'superlike') =>
    request<{ match: Match | null; swipeStatus: SwipeStatus | null }>('/api/discovery/swipe', {
      method: 'POST',
      body: { targetUserId, action },
    }),

  matches: () => request<{ matches: Match[] }>('/api/matches'),

  match: (id: number) => request<{ match: Match }>(`/api/matches/${id}`),

  unmatch: (id: number) => request<{ ok: boolean }>(`/api/matches/${id}`, { method: 'DELETE' }),

  messages: (matchId: number, afterId?: number) =>
    request<{ messages: Message[]; myUserId: number; otherTyping: boolean }>(
      `/api/matches/${matchId}/messages${afterId ? `?afterId=${afterId}` : ''}`
    ),

  sendMessage: (matchId: number, text: string, imageUrl?: string) =>
    request<{ message: Message }>(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      body: { text, imageUrl },
    }),

  nearby: () => request<{ nearby: PublicProfile[]; activeCount: number }>('/api/radar/nearby'),

  // Backs every "view this person's profile" tap - the deck's "Profili aç",
  // a match's "Profili Gör", radar's nearby avatars (see ProfilGoruntule.tsx).
  userProfile: (userId: number) => request<{ user: PublicProfile }>(`/api/users/${userId}`),

  fireHour: () => request<FireHour>('/api/radar/fire-hour'),

  // `dataUrl` must be a "data:<mime>;base64,<...>" string (images) - see
  // src/utils/media.ts for the picker + upload helper that builds this.
  uploadImage: (dataUrl: string) => request<{ url: string }>('/api/uploads', { method: 'POST', body: { dataUrl } }),

  uploadAudio: (dataUrl: string) => request<{ url: string }>('/api/uploads', { method: 'POST', body: { dataUrl } }),

  requestSmsCode: (phone: string) =>
    request<{ ok: boolean; message: string; devCode?: string }>('/api/auth/sms/request', {
      method: 'POST',
      body: { phone },
      auth: false,
    }),

  verifySmsCode: (phone: string, code: string) =>
    request<{ token: string; user: User }>('/api/auth/sms/verify', {
      method: 'POST',
      body: { phone, code },
      auth: false,
    }),

  googleLogin: (idToken: string) =>
    request<{ token: string; user: User }>('/api/auth/google', {
      method: 'POST',
      body: { idToken },
      auth: false,
    }),

  facebookLogin: (code: string, redirectUri: string) =>
    request<{ token: string; user: User }>('/api/auth/facebook', {
      method: 'POST',
      body: { code, redirectUri },
      auth: false,
    }),

  // An empty string clears the registration (called on logout - see
  // AuthContext.logout - so a device that switches accounts stops pushing
  // notifications meant for the previous one).
  registerPushToken: (token: string) =>
    request<{ ok: boolean }>('/api/users/push-token', { method: 'POST', body: { token } }),

  blockUser: (userId: number) => request<{ ok: boolean }>('/api/safety/block', { method: 'POST', body: { userId } }),

  unblockUser: (userId: number) => request<{ ok: boolean }>(`/api/safety/block/${userId}`, { method: 'DELETE' }),

  blockedUsers: () => request<{ blocked: { blockId: number; user: PublicProfile }[] }>('/api/safety/blocked'),

  reportUser: (userId: number, reason?: string) =>
    request<{ ok: boolean }>('/api/safety/report', { method: 'POST', body: { userId, reason } }),
};
