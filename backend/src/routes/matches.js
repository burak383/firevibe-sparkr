const db = require('../db');
const { requireAuth } = require('../auth');
const { serializeMatch } = require('../matching');

function loadMyMatch(matchId, userId) {
  const row = db.findById('matches', matchId);
  if (!row) return null;
  if (row.userAId !== userId && row.userBId !== userId) return null;
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
      .sort((a, b) => b.id - a.id);
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
