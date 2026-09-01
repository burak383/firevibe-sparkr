// Periodic re-engagement push notifications. Runs entirely inside this same
// backend process via setInterval (see server.js's call to
// startReengagementJobs()) - no separate worker/cron service needed, since
// this whole project is a single Render instance. Two independent jobs:
//
//   1. Stale-match reminders - nudges both sides of a match that's had no
//      message activity in 2+ days to pick the conversation back up.
//   2. Fire Hour "starting soon" reminder - one push to everyone, ~15
//      minutes before the daily 21:00-22:00 window opens (see
//      routes/radar.js for the window itself, which this mirrors exactly).
//
// CANNOT BE FULLY EXERCISED FROM THIS SANDBOX: there's no way to wait real
// hours/days for a timer to fire here, and (per push.js's own header
// comment) there's no way to receive a real push outside a development/
// production build anyway. The logic itself was verified directly against
// db.js with fabricated old timestamps - see the dedup/staleness math below.
const db = require('./db');
const { notifyUser } = require('./push');

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // how often this file wakes up to check
const STALE_MATCH_MS = 2 * 24 * 60 * 60 * 1000; // "no message in 2+ days"
// Once a match has been reminded, don't nag again for another 3 days even
// if it's still quiet - avoids re-sending every single CHECK_INTERVAL_MS
// tick for a match nobody's touching.
const REMINDER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

function lastMessageTime(matchId) {
  const msgs = db.filter('messages', (m) => m.matchId === matchId);
  if (msgs.length === 0) return null;
  return msgs.reduce((latest, m) => Math.max(latest, new Date(m.createdAt).getTime()), 0);
}

async function remindStaleMatches() {
  const now = Date.now();
  const matches = db.filter('matches', () => true);
  for (const match of matches) {
    const lastActivity = lastMessageTime(match.id) ?? new Date(match.createdAt).getTime();
    if (now - lastActivity < STALE_MATCH_MS) continue;

    const lastNotified = match.reengagementNotifiedAt ? new Date(match.reengagementNotifiedAt).getTime() : 0;
    if (lastNotified && now - lastNotified < REMINDER_COOLDOWN_MS) continue;

    const userA = db.findById('users', match.userAId);
    const userB = db.findById('users', match.userBId);
    // Only ever push to a real (non-bot) recipient - bots don't have real
    // devices/tokens to receive anything anyway (notifyUser would no-op on
    // them regardless, since they never register a pushToken), but skipping
    // them explicitly keeps the intent obvious here.
    if (userA && !userA.isBot) {
      await notifyUser(userA.id, {
        title: 'Sohbeti canlandır',
        body: `${userB ? userB.name : 'Eşleşmen'} ile konuşmaya devam etmeye ne dersin?`,
        data: { type: 'stale-match', matchId: match.id },
      });
    }
    if (userB && !userB.isBot) {
      await notifyUser(userB.id, {
        title: 'Sohbeti canlandır',
        body: `${userA ? userA.name : 'Eşleşmen'} ile konuşmaya devam etmeye ne dersin?`,
        data: { type: 'stale-match', matchId: match.id },
      });
    }
    db.update('matches', match.id, { reengagementNotifiedAt: new Date(now).toISOString() });
  }
}

// In-memory only (not persisted to db.js) - a backend restart landing
// exactly inside the 15-minute lead window could rarely cause one duplicate
// reminder for that one day. A harmless trade-off against adding a whole
// persisted collection just for a once-a-day marketing ping.
let lastFireHourReminderDateKey = null;

async function remindFireHourStartingSoon() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(21, 0, 0, 0);
  const minutesToStart = (start.getTime() - now.getTime()) / 60000;
  // Only fire once we're inside the 15-minute lead window before 21:00, and
  // only forward in time (never for a 21:00 that already passed today).
  if (minutesToStart <= 0 || minutesToStart > 15) return;

  const todayKey = start.toISOString().slice(0, 10);
  if (lastFireHourReminderDateKey === todayKey) return;
  lastFireHourReminderDateKey = todayKey;

  const users = db.filter('users', (u) => !u.isBot && u.visible !== false);
  for (const user of users) {
    await notifyUser(user.id, {
      title: 'Fire Hour yaklaşıyor',
      body: "Saat 21:00'de bölgende herkes aktif olacak - hazırlan!",
      data: { type: 'fire-hour-soon' },
    });
  }
}

let started = false;

// Call once at server startup (see server.js). Guarded against being called
// twice (e.g. by a hot-reload) since setInterval would otherwise stack a
// second, fully duplicate ticking job.
function startReengagementJobs() {
  if (started) return;
  started = true;
  setInterval(() => {
    remindStaleMatches().catch((err) => console.error('[reengagement] stale-match job failed:', err));
    remindFireHourStartingSoon().catch((err) => console.error('[reengagement] fire-hour job failed:', err));
  }, CHECK_INTERVAL_MS);
}

module.exports = { startReengagementJobs, remindStaleMatches, remindFireHourStartingSoon };
