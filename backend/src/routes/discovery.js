const db = require('../db');
const { requireAuth } = require('../auth');
const { toPublicProfile } = require('../serialize');
const { compatibility, findOrCreateMatch, serializeMatch } = require('../matching');
const { isBlockedEitherWay } = require('./safety');
const { notifyUser } = require('../push');
const { consumeFreeSwipe } = require('../subscription');

const routes = [];

routes.push({
  method: 'GET',
  path: '/api/discovery/deck',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const me = db.findById('users', userId);

    const alreadySwiped = new Set(
      db.filter('swipes', (s) => s.userId === userId).map((s) => s.targetUserId)
    );

    const deck = db
      .filter(
        'users',
        (u) => u.id !== userId && u.visible !== false && !alreadySwiped.has(u.id) && !isBlockedEitherWay(userId, u.id)
      )
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
      .slice(0, 20)
      .map((row) => ({ ...toPublicProfile(row), compatibility: compatibility(me, row) }));

    res.json({ deck });
  },
});

routes.push({
  method: 'POST',
  path: '/api/discovery/swipe',
  handler: async (req, res, params, body) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;

    const targetUserId = Number(body.targetUserId);
    const action = body.action;
    if (!Number.isFinite(targetUserId) || !['like', 'pass', 'superlike'].includes(action)) {
      return res.status(400).json({ error: 'Geçersiz bilgi' });
    }
    if (targetUserId === userId) return res.status(400).json({ error: 'Kendini kaydıramazsın.' });

    const target = db.findById('users', targetUserId);
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (isBlockedEitherWay(userId, targetUserId)) {
      return res.status(403).json({ error: 'Bu kullanıcıyla etkileşim kuramazsın.' });
    }

    let me = db.findById('users', userId);
    if (!me) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    // Passing is unlimited by design - only a right-swipe (like/superlike)
    // draws down the free daily allowance, and premium accounts skip this
    // check entirely (see ../subscription.js). Checked BEFORE the swipe is
    // recorded, so a blocked attempt doesn't get persisted as a used swipe -
    // it stays retryable once the limit resets or premium is bought.
    let swipeStatus = null;
    if (action === 'like' || action === 'superlike') {
      const gate = consumeFreeSwipe(me);
      swipeStatus = { premium: gate.premium, remaining: gate.remaining, resetAt: gate.resetAt };
      if (!gate.allowed) {
        return res.status(402).json({
          error: 'Günlük ücretsiz beğeni hakkını kullandın. Premium ile sınırsız beğen.',
          swipeStatus,
        });
      }
      me = db.findById('users', userId); // re-read: consumeFreeSwipe just persisted the new count
    }

    const existingSwipe = db.find('swipes', (s) => s.userId === userId && s.targetUserId === targetUserId);
    if (existingSwipe) {
      db.update('swipes', existingSwipe.id, { action });
    } else {
      db.insert('swipes', { userId, targetUserId, action });
    }

    let match = null;

    if (action === 'like' || action === 'superlike') {
      // Bot profiles like back instantly so the app is fully testable single-player.
      if (target.isBot) {
        const botAlreadySwiped = db.find(
          'swipes',
          (s) => s.userId === targetUserId && s.targetUserId === userId
        );
        if (!botAlreadySwiped) {
          db.insert('swipes', { userId: targetUserId, targetUserId: userId, action: 'like' });
        }
      }

      const theyLikedMe = db.find(
        'swipes',
        (s) => s.userId === targetUserId && s.targetUserId === userId && (s.action === 'like' || s.action === 'superlike')
      );

      if (theyLikedMe) {
        const { match: createdMatch, isNew } = findOrCreateMatch(me, target, compatibility(me, target));
        match = serializeMatch(createdMatch, userId);

        // Only the OTHER person needs a push - the caller already sees the
        // match right here in this response. Only for a genuinely new match
        // (not two people re-swiping each other after an unmatch), and
        // never for a bot (it has no device/pushToken to register).
        if (isNew && !target.isBot) {
          notifyUser(target.id, {
            title: 'Yeni bir Vibe Match! 🔥',
            body: `${me.name} ile eşleştin.`,
            data: { type: 'match', matchId: createdMatch.id },
          }).catch(() => {});
        }
      }
    }

    res.json({ match, swipeStatus });
  },
});

module.exports = routes;
