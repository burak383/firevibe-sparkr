const db = require('../db');
const { requireAuth } = require('../auth');
const { toPublicUser } = require('../serialize');

// True if `userId` has blocked `otherId`, in either direction - used
// everywhere two users' visibility to each other matters (deck, radar,
// swipe, messaging).
function isBlockedEitherWay(userId, otherId) {
  return !!db.find(
    'blocks',
    (b) =>
      (b.blockerId === userId && b.blockedId === otherId) || (b.blockerId === otherId && b.blockedId === userId)
  );
}

const routes = [];

routes.push({
  method: 'GET',
  path: '/api/safety/blocked',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const blocks = db.filter('blocks', (b) => b.blockerId === userId).sort((a, b) => b.id - a.id);
    const blockedUsers = blocks
      .map((b) => {
        const user = db.findById('users', b.blockedId);
        return user ? { blockId: b.id, user: toPublicUser(user) } : null;
      })
      .filter(Boolean);
    res.json({ blocked: blockedUsers });
  },
});

routes.push({
  method: 'POST',
  path: '/api/safety/block',
  handler: async (req, res, params, body) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const targetUserId = Number(body.userId);
    if (!Number.isFinite(targetUserId)) return res.status(400).json({ error: 'Geçersiz kullanıcı' });
    if (targetUserId === userId) return res.status(400).json({ error: 'Kendini engelleyemezsin.' });

    const target = db.findById('users', targetUserId);
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const existing = db.find('blocks', (b) => b.blockerId === userId && b.blockedId === targetUserId);
    if (!existing) {
      db.insert('blocks', { blockerId: userId, blockedId: targetUserId });
    }

    // A block also ends any existing match/conversation between the two,
    // in both directions - blocking someone shouldn't leave a live chat open.
    const sharedMatches = db.filter(
      'matches',
      (m) =>
        (m.userAId === userId && m.userBId === targetUserId) || (m.userAId === targetUserId && m.userBId === userId)
    );
    for (const m of sharedMatches) {
      db.removeWhere('messages', (msg) => msg.matchId === m.id);
      db.remove('matches', m.id);
    }

    res.json({ ok: true });
  },
});

routes.push({
  method: 'DELETE',
  path: '/api/safety/block/:userId',
  handler: async (req, res, params) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const targetUserId = Number(params.userId);
    const removed = db.removeWhere('blocks', (b) => b.blockerId === userId && b.blockedId === targetUserId);
    res.json({ ok: true, removed: removed > 0 });
  },
});

routes.push({
  method: 'POST',
  path: '/api/safety/report',
  handler: async (req, res, params, body) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const targetUserId = Number(body.userId);
    if (!Number.isFinite(targetUserId)) return res.status(400).json({ error: 'Geçersiz kullanıcı' });
    if (targetUserId === userId) return res.status(400).json({ error: 'Kendini şikayet edemezsin.' });

    const target = db.findById('users', targetUserId);
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 300) : 'Belirtilmedi';
    db.insert('reports', { reporterId: userId, reportedUserId: targetUserId, reason });

    console.log(`[safety] Şikayet: kullanıcı #${userId} -> kullanıcı #${targetUserId} (${reason})`);

    res.status(201).json({ ok: true });
  },
});

module.exports = { routes, isBlockedEitherWay };
