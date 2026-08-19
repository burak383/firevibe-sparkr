const db = require('../db');
const { requireAuth } = require('../auth');
const { toPublicUser } = require('../serialize');

const MOODS = ['Chill', 'Party', 'Deep Talk', 'Adrenaline'];

function buildPatch(body) {
  const patch = {};
  const strFields = ['name', 'bio', 'city', 'neighbourhood', 'avatarUrl', 'voiceNoteUrl', 'favoriteTrack'];
  for (const field of strFields) {
    if (typeof body[field] === 'string') patch[field] = body[field];
  }
  if (body.mood && MOODS.includes(body.mood)) patch.mood = body.mood;
  if (typeof body.visible === 'boolean') patch.visible = body.visible;
  if (Number.isFinite(body.ageRangeMin)) patch.ageRangeMin = Math.round(body.ageRangeMin);
  if (Number.isFinite(body.ageRangeMax)) patch.ageRangeMax = Math.round(body.ageRangeMax);
  if (Number.isFinite(body.discoveryRadiusKm)) patch.discoveryRadiusKm = Math.round(body.discoveryRadiusKm);
  if (Array.isArray(body.gallery)) patch.gallery = body.gallery.filter((x) => typeof x === 'string');
  if (Array.isArray(body.musicTags)) patch.musicTags = body.musicTags.filter((x) => typeof x === 'string');
  if (Array.isArray(body.vibeTags)) patch.vibeTags = body.vibeTags.filter((x) => typeof x === 'string');
  if (body.bio && body.bio.length > 120) patch.bio = body.bio.slice(0, 120);
  return patch;
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
    const patch = buildPatch(body);
    if (typeof body.onboardingComplete === 'boolean') patch.onboardingComplete = body.onboardingComplete;
    const row = db.update('users', userId, patch);
    if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ user: toPublicUser(row) });
  },
});

// Convenience endpoint for the "Vibe Kurulumu" onboarding screen.
routes.push({
  method: 'POST',
  path: '/api/users/me/vibe-setup',
  handler: async (req, res, params, body) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const patch = buildPatch(body);
    patch.onboardingComplete = true;
    const row = db.update('users', userId, patch);
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

module.exports = routes;
