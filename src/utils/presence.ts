// Turns a profile's `lastActiveAt` (bumped server-side on every
// authenticated request - see backend/src/auth.js's requireAuth) into the
// real "Aktif şimdi" / "X dk önce aktifti" labels and online dots shown
// around the app, replacing what used to be a hardcoded `true`/"Aktif
// şimdi" everywhere.

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function isOnline(lastActiveAt: string | null): boolean {
  if (!lastActiveAt) return false;
  return Date.now() - new Date(lastActiveAt).getTime() < ONLINE_WINDOW_MS;
}

export function presenceLabel(lastActiveAt: string | null): string {
  if (!lastActiveAt) return 'Çevrimdışı';
  const diffMs = Date.now() - new Date(lastActiveAt).getTime();
  if (diffMs < ONLINE_WINDOW_MS) return 'Aktif şimdi';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} dk önce aktifti`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce aktifti`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce aktifti`;
  return 'Uzun süredir aktif değil';
}
