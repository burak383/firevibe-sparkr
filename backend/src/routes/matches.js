const db = require('../db');
const { requireAuth } = require('../auth');
const { serializeMatch, pruneIfExpired, recordMetFeedback } = require('../matching');

// Expiry-aware on purpose - a Fire Hour match nobody ever replied to (see
// matching.js's pruneIfExpired) is treated as if it never existed the
// moment its window passes, for every caller (this file's own handlers AND
// routes/messages.js, which also calls this). Deletes it right then rather
// than leaving a dead row lying around until the next full list fetch.
function loadMyMatch(matchId, userId) {
  const row = db.findById('matches', matchId);
  if (!row) return null;
  if (row.userAId !== userId && row.userBId !== userId) return null;
  if (pruneIfExpired(row)) return null;
  return row;
}

const routes = [];

routes.push({
  method: 'GET',
  path: '/api/matches',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const rows = db
      .filter('matches', (m) => m.userAId === userId || m.userBId === userId)
      .sort((a, b) => b.id - a.id)
      .filter((row) => !pruneIfExpired(row));
    res.json({ matches: rows.map((row) => serializeMatch(row, userId)) });
  },
});

routes.push({
  method: 'GET',
  path: '/api/matches/:id',
  handler: async (req, res, params) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const match = loadMyMatch(Number(params.id), userId);
    if (!match) return res.status(404).json({ error: 'Eşleşme bulunamadı' });
    res.json({ match: serializeMatch(match, userId) });
  },
});

// "Buluştun mu?" feedback - see matching.js's recordMetFeedback/
// MET_PROMPT_DELAY_MS. `met` is required and must be a boolean; anything
// else is rejected rather than silently coerced.
routes.push({
  method: 'POST',
  path: '/api/matches/:id/met-feedback',
  handler: async (req, res, params, body) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const match = loadMyMatch(Number(params.id), userId);
    if (!match) return res.status(404).json({ error: 'Eşleşme bulunamadı' });
    if (typeof body.met !== 'boolean') {
      return res.status(400).json({ error: 'Geçersiz bilgi' });
    }
    recordMetFeedback(match, userId, body.met);
    const updated = loadMyMatch(match.id, userId);
    res.json({ match: serializeMatch(updated, userId) });
  },
});

routes.push({
  method: 'DELETE',
  path: '/api/matches/:id',
  handler: async (req, res, params) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const match = loadMyMatch(Number(params.id), userId);
    if (!match) return res.status(404).json({ error: 'Eşleşme bulunamadı' });
    db.removeWhere('messages', (m) => m.matchId === match.id);
    db.remove('matches', match.id);
    res.json({ ok: true });
  },
});

module.exports = { routes, loadMyMatch };
