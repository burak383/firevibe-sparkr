const db = require('../db');
const { requireAuth } = require('../auth');
const { toPublicUser } = require('../serialize');
const { isBlockedEitherWay } = require('./safety');

const routes = [];

routes.push({
  method: 'GET',
  path: '/api/radar/nearby',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const rows = db
      .filter('users', (u) => u.id !== userId && u.visible !== false && !isBlockedEitherWay(userId, u.id))
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
      .slice(0, 12);
    res.json({ nearby: rows.map(toPublicUser), activeCount: rows.length + 34 });
  },
});

routes.push({
  method: 'GET',
  path: '/api/radar/fire-hour',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;

    const now = new Date();
    const start = new Date(now);
    start.setHours(21, 0, 0, 0);
    const end = new Date(start);
    end.setHours(22, 0, 0, 0);
    const isLive = now >= start && now < end;
    const minutesToStart = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60000));
    const minutesLeft = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000));

    res.json({
      windowStart: '21:00',
      windowEnd: '22:00',
      isLive,
      minutesToStart: isLive ? null : minutesToStart,
      minutesLeft: isLive ? minutesLeft : null,
      activeNearby: 46,
    });
  },
});

module.exports = routes;
