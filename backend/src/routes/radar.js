const db = require('../db');
const { requireAuth } = require('../auth');
const { toPublicProfile } = require('../serialize');
const { isBlockedEitherWay } = require('./safety');
const { resolveDistanceKm } = require('../geo');
const { getFireHourWindow, isFireHourLive } = require('../fireHour');

// Mirrors src/utils/presence.ts's ONLINE_WINDOW_MS on the mobile side - a
// user counts as "active now" if they made an authenticated request (which
// bumps lastActiveAt - see ../auth.js's touchLastActive) in the last 2
// minutes. Used to report a REAL active-nearby count instead of the old
// `rows.length + 34` / hardcoded `46` placeholders, which were fabricated
// numbers with no connection to actual usage.
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

function isRecentlyActive(user) {
  return !!user.lastActiveAt && Date.now() - new Date(user.lastActiveAt).getTime() < ONLINE_WINDOW_MS;
}

// Shared by both routes below - "everyone visible to me right now" (same
// filter as the nearby list), then how many of THOSE are actually active
// this minute.
function countActiveNearby(userId) {
  return db.filter(
    'users',
    (u) => u.id !== userId && u.visible !== false && !u.banned && !isBlockedEitherWay(userId, u.id) && isRecentlyActive(u)
  ).length;
}

const routes = [];

routes.push({
  method: 'GET',
  path: '/api/radar/nearby',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const me = db.findById('users', userId);
    const rows = db
      .filter('users', (u) => u.id !== userId && u.visible !== false && !u.banned && !isBlockedEitherWay(userId, u.id))
      // Real distance when both sides have a saved GPS position (see
      // ../geo.js), same fallback as routes/discovery.js's deck otherwise.
      .sort((a, b) => resolveDistanceKm(me, a) - resolveDistanceKm(me, b))
      .slice(0, 12);
    res.json({ nearby: rows.map((row) => toPublicProfile(row, me)), activeCount: countActiveNearby(userId) });
  },
});

routes.push({
  method: 'GET',
  path: '/api/radar/fire-hour',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;

    const now = new Date();
    const { start, end } = getFireHourWindow(now);
    const isLive = isFireHourLive(now);
    const minutesToStart = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60000));
    const minutesLeft = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000));

    res.json({
      windowStart: '21:00',
      windowEnd: '22:00',
      isLive,
      minutesToStart: isLive ? null : minutesToStart,
      minutesLeft: isLive ? minutesLeft : null,
      activeNearby: countActiveNearby(userId),
    });
  },
});

module.exports = routes;
