const db = require('../db');
const { requireAuth } = require('../auth');
const { toPublicUser, toPublicProfile } = require('../serialize');
const { isBlockedEitherWay } = require('./safety');
const { isExpoPushToken } = require('../push');
const { containsBlockedText } = require('../moderation');
const { computeAge } = require('../age');

const MOODS = ['Chill', 'Party', 'Deep Talk', 'Adrenaline'];

// One row per (viewerId, viewedUserId) pair - repeat views bump viewedAt
// rather than inserting duplicates, same dedup pattern as swipes. Feeds
// routes/discovery.js's GET /profile-views (the "Görüntüleyenler" tab).
function recordProfileView(viewerId, viewedUserId) {
  if (viewerId === viewedUserId) return;
  const existing = db.find('profileViews', (v) => v.viewerId === viewerId && v.viewedUserId === viewedUserId);
  const viewedAt = new Date().toISOString();
  if (existing) {
    db.update('profileViews', existing.id, { viewedAt });
  } else {
    db.insert('profileViews', { viewerId, viewedUserId, viewedAt });
  }
}

function buildPatch(body) {
  const patch = {};
  const strFields = ['name', 'bio', 'city', 'neighbourhood', 'avatarUrl', 'voiceNoteUrl', 'favoriteTrack'];
  for (const field of strFields) {
    if (typeof body[field] === 'string') patch[field] = body[field];
  }
  if (body.mood && MOODS.includes(body.mood)) patch.mood = body.mood;
  if (typeof body.visible === 'boolean') patch.visible = body.visible;
  // "Okundu bilgisini kapat" toggle (default true/on) - see
  // routes/messages.js's GET handler for where this is actually enforced.
  if (typeof body.readReceiptsEnabled === 'boolean') patch.readReceiptsEnabled = body.readReceiptsEnabled;
  // Clamp to the same 18-50 bounds the mobile app's drag slider enforces -
  // defense in depth in case a request ever reaches this endpoint some
  // other way than that slider (an older client build, a direct API call).
  if (Number.isFinite(body.ageRangeMin)) {
    patch.ageRangeMin = Math.min(50, Math.max(18, Math.round(body.ageRangeMin)));
  }
  if (Number.isFinite(body.ageRangeMax)) {
    patch.ageRangeMax = Math.min(50, Math.max(18, Math.round(body.ageRangeMax)));
  }
  if (
    typeof patch.ageRangeMin === 'number' &&
    typeof patch.ageRangeMax === 'number' &&
    patch.ageRangeMin > patch.ageRangeMax
  ) {
    // Only one bound was likely dragged past the other in a single request -
    // keep them from inverting rather than rejecting the whole save.
    const mid = patch.ageRangeMin;
    patch.ageRangeMin = patch.ageRangeMax;
    patch.ageRangeMax = mid;
  }
  if (Number.isFinite(body.discoveryRadiusKm)) patch.discoveryRadiusKm = Math.round(body.discoveryRadiusKm);
  if (Array.isArray(body.gallery)) patch.gallery = body.gallery.filter((x) => typeof x === 'string');
  if (Array.isArray(body.musicTags)) patch.musicTags = body.musicTags.filter((x) => typeof x === 'string');
  if (Array.isArray(body.vibeTags)) patch.vibeTags = body.vibeTags.filter((x) => typeof x === 'string');
  if (body.bio && body.bio.length > 120) patch.bio = body.bio.slice(0, 120);
  return patch;
}

// The app asks for (and saves) the person's real GPS-detected city right
// after login (see mobile/src/navigation/RootNavigator.tsx) and again from
// the "Konumu bul" button in Profil.tsx if that first attempt failed. Either
// way, the FIRST successful city save should stick permanently - otherwise
// someone could fake a different city than where they actually are, which
// matters for a dating app built around "who's nearby". Mutates `patch` in
// place: drops city/neighbourhood entirely once already confirmed, or flips
// on the confirmed flag the moment a city is saved for the first time.
function applyLocationLock(row, patch) {
  if (row.locationConfirmed) {
    delete patch.city;
    delete patch.neighbourhood;
    return;
  }
  if (typeof patch.city === 'string' && patch.city.trim()) {
    patch.locationConfirmed = true;
  }
}

// Free-text profile fields a user can type themselves (as opposed to
// avatarUrl/voiceNoteUrl, which are just links to files already screened by
// Vision/Whisper at upload time - see ../moderation.js and routes/uploads.js
// - and musicTags/vibeTags, which the app only ever sets from a fixed preset
// list, never free typing). Checked with the same word-list filter used on
// chat text, at zero extra cost (no external API).
const MODERATED_TEXT_FIELDS = ['name', 'bio', 'city', 'neighbourhood', 'favoriteTrack'];

// Returns a Turkish error message naming the first offending field, or null
// if the patch is clean. Called before ANY of buildPatch's fields are saved,
// so a rejected update leaves the profile completely unchanged rather than
// partially applied.
function findBlockedProfileText(patch) {
  for (const field of MODERATED_TEXT_FIELDS) {
    if (typeof patch[field] === 'string' && containsBlockedText(patch[field])) {
      return `Profilinde küfür veya cinsel içerik barındıran bir alan var, kaydedilemedi.`;
    }
  }
  return null;
}

const routes = [];

routes.push({
  method: 'GET',
  path: '/api/users/me',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const row = db.findById('users', userId);
    if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ user: toPublicUser(row) });
  },
});

routes.push({
  method: 'PUT',
  path: '/api/users/me',
  handler: async (req, res, params, body) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const existing = db.findById('users', userId);
    if (!existing) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    const patch = buildPatch(body);
    applyLocationLock(existing, patch);
    const blockedReason = findBlockedProfileText(patch);
    if (blockedReason) return res.status(422).json({ error: blockedReason });
    if (typeof body.onboardingComplete === 'boolean') patch.onboardingComplete = body.onboardingComplete;
    const row = db.update('users', userId, patch);
    if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ user: toPublicUser(row) });
  },
});

// Registers (or clears) this device's Expo push token against the caller's
// own account - see ../push.js for what actually sends notifications, and
// routes/discovery.js / routes/messages.js for where those get triggered.
// An empty token clears it (called on logout, so a device that switches to
// a different account stops pushing to the previous one).
routes.push({
  method: 'POST',
  path: '/api/users/push-token',
  handler: async (req, res, params, body) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (token && !isExpoPushToken(token)) {
      return res.status(400).json({ error: 'Geçersiz push token' });
    }
    const row = db.update('users', userId, { pushToken: token || null });
    if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ ok: true });
  },
});

// Convenience endpoint for the "Vibe Kurulumu" onboarding screen.
//
// Also doubles as the one-and-only place a Google/Apple-created
// account ever gets to complete the 18+ age check that /api/auth/register
// already enforces for direct email/password signups. Those social
// routes (see routes/auth.js) can't verify age themselves - neither Google
// nor Apple's basic sign-in scopes hand back a birth date - so they
// create the account with `age: null`/`birthDate: ''` and defer the check to
// here instead of skipping it outright. The mobile app's VibeKurulumu.tsx
// shows a mandatory birth-date field only when `user.age == null`, and this
// is where that gets validated before onboarding can complete.
routes.push({
  method: 'POST',
  path: '/api/users/me/vibe-setup',
  handler: async (req, res, params, body) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const existing = db.findById('users', userId);
    if (!existing) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const patch = buildPatch(body);
    const blockedReason = findBlockedProfileText(patch);
    if (blockedReason) return res.status(422).json({ error: blockedReason });

    // Only accepted (and only matters) once, for an account that has never
    // had its age verified - an already-verified account (age is a number,
    // set either at /register or by a previous call here) can't submit a
    // new birthDate through this endpoint at all; age, once verified, is as
    // immutable as the location lock in applyLocationLock above.
    if (existing.age === null || existing.age === undefined) {
      const birthDate = typeof body.birthDate === 'string' ? body.birthDate.trim() : '';
      if (!birthDate) {
        return res.status(400).json({ error: 'Devam etmek için doğum tarihini girmelisin.' });
      }
      const age = computeAge(birthDate);
      if (age === null) {
        return res.status(400).json({ error: 'Doğum tarihini GG/AA/YYYY formatında gir.' });
      }
      if (age < 18) {
        return res.status(400).json({ error: 'SparkR’a katılmak için 18 yaşından büyük olmalısın.' });
      }
      patch.birthDate = birthDate;
      patch.age = age;
    }

    patch.onboardingComplete = true;
    const row = db.update('users', userId, patch);
    if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ user: toPublicUser(row) });
  },
});

// Flips on the "verified" badge after the user submits a live selfie (see
// SelfieDogrulama.tsx - it forces the front camera rather than the photo
// library, so at least a real photo was taken just now).
//
// HONEST LIMITATION: this demo has no human moderation queue and no real
// face-match/liveness model behind it, so submitting ANY selfie photo
// approves instantly - it can't actually confirm the selfie matches the
// person in the profile photos. A real product would hold this as
// "pending" until a moderator or a dedicated face-match/liveness API
// approves it, rather than trusting the client like this.
routes.push({
  method: 'POST',
  path: '/api/users/me/verify-selfie',
  handler: async (req, res, params, body) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const selfieUrl = typeof body.selfieUrl === 'string' ? body.selfieUrl.trim() : '';
    if (!selfieUrl) return res.status(400).json({ error: 'Bir selfie fotoğrafı gerekli.' });
    const row = db.update('users', userId, { verified: true, verifiedAt: new Date().toISOString() });
    if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ user: toPublicUser(row) });
  },
});

routes.push({
  method: 'DELETE',
  path: '/api/users/me',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    db.removeWhere('swipes', (s) => s.userId === userId || s.targetUserId === userId);
    const myMatches = db.filter('matches', (m) => m.userAId === userId || m.userBId === userId);
    for (const m of myMatches) {
      db.removeWhere('messages', (msg) => msg.matchId === m.id);
    }
    db.removeWhere('matches', (m) => m.userAId === userId || m.userBId === userId);
    db.removeWhere('blocks', (b) => b.blockerId === userId || b.blockedId === userId);
    db.removeWhere('reports', (r) => r.reporterId === userId || r.reportedUserId === userId);
    db.remove('users', userId);
    res.json({ ok: true });
  },
});

// Backs every "view this person's profile" tap in the app (discovery deck's
// "Profili aç", a match's "Profili Gör", radar's nearby avatars). Deliberately
// placed AFTER /api/users/me above in this array - route matching in
// server.js tries routes in order and stops at the first match, so the
// literal "me" path has to win before this ":id" pattern gets a chance to
// (wrongly) treat "me" as a numeric id.
routes.push({
  method: 'GET',
  path: '/api/users/:id',
  handler: async (req, res, params) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const targetId = Number(params.id);
    if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Geçersiz kullanıcı' });
    if (isBlockedEitherWay(userId, targetId)) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }
    const row = db.findById('users', targetId);
    if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    recordProfileView(userId, targetId);
    res.json({ user: toPublicProfile(row) });
  },
});

module.exports = routes;
