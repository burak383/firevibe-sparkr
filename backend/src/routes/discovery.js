const db = require('../db');
const { requireAuth } = require('../auth');
const { toPublicProfile } = require('../serialize');
const { compatibility, findOrCreateMatch, serializeMatch } = require('../matching');
const { isBlockedEitherWay } = require('./safety');
const { notifyUser } = require('../push');
const { consumeFreeSwipe, consumeSuperlike, hasActivePremium, hasActiveBoost } = require('../subscription');

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
      // Boosted users (one-time consumable purchase - see
      // ../subscription.js's hasActiveBoost) get sorted to the very front of
      // everyone's deck for their boost window, before the usual
      // nearest-first ordering.
      .sort((a, b) => {
        const aBoost = hasActiveBoost(a) ? 0 : 1;
        const bBoost = hasActiveBoost(b) ? 0 : 1;
        if (aBoost !== bBoost) return aBoost - bBoost;
        return (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
      })
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
    // draws down a daily allowance, and premium accounts skip the plain-like
    // check entirely (see ../subscription.js). Checked BEFORE the swipe is
    // recorded, so a blocked attempt doesn't get persisted as a used swipe -
    // it stays retryable once the limit resets or premium is bought.
    //
    // 'like' and 'superlike' are two SEPARATE pools: 'like' still uses the
    // shared consumeFreeSwipe pool (10/day free, unlimited premium).
    // 'superlike' has its own consumeSuperlike pool (0/day free, capped at
    // 5/day premium) - premium no longer gets unlimited super likes.
    let swipeStatus = null;
    let superlikeStatus = null;
    if (action === 'like') {
      const gate = consumeFreeSwipe(me);
      swipeStatus = { premium: gate.premium, remaining: gate.remaining, resetAt: gate.resetAt };
      if (!gate.allowed) {
        return res.status(402).json({
          error: 'Günlük ücretsiz beğeni hakkını kullandın. Premium ile sınırsız beğen.',
          swipeStatus,
        });
      }
      me = db.findById('users', userId); // re-read: consumeFreeSwipe just persisted the new count
    } else if (action === 'superlike') {
      const gate = consumeSuperlike(me);
      superlikeStatus = { premium: gate.premium, limit: gate.limit, remaining: gate.remaining, resetAt: gate.resetAt };
      if (!gate.allowed) {
        const error = gate.premium
          ? 'Günlük Super Vibe hakkını kullandın. Yarın tekrar dene.'
          : 'Super Vibe göndermek için Premium\'a geç.';
        return res.status(402).json({ error, superlikeStatus });
      }
      me = db.findById('users', userId); // re-read: consumeSuperlike just persisted the new count
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

    res.json({ match, swipeStatus, superlikeStatus });
  },
});

// Rewind - undo my own most recent swipe (any action), premium-only. If
// that swipe had already turned into a mutual match, undo the match too
// (and its messages) - rewinding a decision should undo everything it
// caused, not leave a dangling match with no swipe behind it.
routes.push({
  method: 'POST',
  path: '/api/discovery/rewind',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const me = db.findById('users', userId);
    if (!me) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    if (!hasActivePremium(me)) {
      return res.status(402).json({ error: 'Son kararını geri almak için Premium\'a geç.' });
    }

    const last = db.filter('swipes', (s) => s.userId === userId).sort((a, b) => b.id - a.id)[0];
    if (!last) {
      return res.status(404).json({ error: 'Geri alınacak bir şey yok.' });
    }

    db.remove('swipes', last.id);

    const existingMatch = db.find(
      'matches',
      (m) =>
        (m.userAId === userId && m.userBId === last.targetUserId) ||
        (m.userBId === userId && m.userAId === last.targetUserId)
    );
    if (existingMatch) {
      db.removeWhere('messages', (msg) => msg.matchId === existingMatch.id);
      db.remove('matches', existingMatch.id);
    }

    const target = db.findById('users', last.targetUserId);
    res.json({
      profile: target ? { ...toPublicProfile(target), compatibility: compatibility(me, target) } : null,
    });
  },
});

// "Görüntüleyenler" - who's viewed my profile (see routes/users.js's
// recordProfileView, triggered by GET /api/users/:id). Same lock pattern as
// likes-received: full data + `premium` flag, client blurs when not
// premium. Unlike likes-received, nothing here needs excluding for
// already-matched/already-decided people - viewing has no side effect, so
// there's no "this became something else" case to filter out.
routes.push({
  method: 'GET',
  path: '/api/discovery/profile-views',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const me = db.findById('users', userId);
    if (!me) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const viewers = db
      .filter('profileViews', (v) => v.viewedUserId === userId && !isBlockedEitherWay(userId, v.viewerId))
      .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime())
      .map((v) => {
        const row = db.findById('users', v.viewerId);
        if (!row || row.visible === false) return null;
        return {
          ...toPublicProfile(row),
          compatibility: compatibility(me, row),
          viewedAt: v.viewedAt,
        };
      })
      .filter(Boolean);

    res.json({ viewers, premium: hasActivePremium(me) });
  },
});

// "Beğenenler" - people who swiped like/superlike on ME that I haven't
// swiped on yet. Once I swipe on someone (any action), they leave this list
// for good: a like/superlike on someone who already liked me creates an
// instant match right in the handler above, so nobody who belongs here can
// already be matched with me - excluding "anyone I've already decided on"
// is the only filter needed, and it naturally excludes existing matches too.
// `premium` tells the client whether to show these full (name/photo,
// tappable, likeable) or locked (blurred, inert) - see Begeniler.tsx.
routes.push({
  method: 'GET',
  path: '/api/discovery/likes-received',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const me = db.findById('users', userId);
    if (!me) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const alreadyDecided = new Set(db.filter('swipes', (s) => s.userId === userId).map((s) => s.targetUserId));

    const likers = db
      .filter(
        'swipes',
        (s) =>
          s.targetUserId === userId &&
          (s.action === 'like' || s.action === 'superlike') &&
          !alreadyDecided.has(s.userId) &&
          !isBlockedEitherWay(userId, s.userId)
      )
      .sort((a, b) => b.id - a.id)
      .map((s) => {
        const row = db.findById('users', s.userId);
        if (!row || row.visible === false) return null;
        return {
          ...toPublicProfile(row),
          compatibility: compatibility(me, row),
          superlike: s.action === 'superlike',
          likedAt: s.createdAt,
        };
      })
      .filter(Boolean);

    res.json({ likers, premium: hasActivePremium(me) });
  },
});

// "Beğeniler" - everyone I've swiped like/superlike on, most recent first.
// Always full/unlocked, per design - liking is your own action, nothing to
// paywall here. `matched` just tells the client whether it already turned
// mutual (then this person is also in Sohbetler/Matches).
routes.push({
  method: 'GET',
  path: '/api/discovery/likes-sent',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const me = db.findById('users', userId);
    if (!me) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const matchedIds = new Set(
      db
        .filter('matches', (m) => m.userAId === userId || m.userBId === userId)
        .map((m) => (m.userAId === userId ? m.userBId : m.userAId))
    );

    const liked = db
      .filter(
        'swipes',
        (s) => s.userId === userId && (s.action === 'like' || s.action === 'superlike') && !isBlockedEitherWay(userId, s.targetUserId)
      )
      .sort((a, b) => b.id - a.id)
      .map((s) => {
        const row = db.findById('users', s.targetUserId);
        if (!row) return null;
        return {
          ...toPublicProfile(row),
          compatibility: compatibility(me, row),
          superlike: s.action === 'superlike',
          likedAt: s.createdAt,
          matched: matchedIds.has(s.targetUserId),
        };
      })
      .filter(Boolean);

    res.json({ liked });
  },
});

module.exports = routes;
