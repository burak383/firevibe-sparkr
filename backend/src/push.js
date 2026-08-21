// Sends push notifications through Expo's push service, using only Node's
// built-in `https` module - this backend is intentionally zero-dependency,
// so we can't just `npm install expo-server-sdk`. See:
// https://docs.expo.dev/push-notifications/sending-notifications/
//
// IMPORTANT CAVEAT (as of Expo SDK 53+): Expo Go no longer supports push
// notifications at all, on either platform - a device only ever gets a
// real token (and can only actually receive what we send here) from a
// development or production build made with EAS, not from Expo Go. This
// module works correctly regardless; there's just nothing to test against
// until the mobile side is running from a real build.
const https = require('https');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_PER_REQUEST = 100; // Expo's documented batch limit per request

function isExpoPushToken(token) {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload));
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': data.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Fire-and-forget from the CALLER's point of view - a push failing (bad or
// stale token, Expo's service being briefly down, no route to the internet
// in a sandboxed dev run) must never break the actual API request that
// triggered it (sending a message, getting a match). Every error is caught
// and logged right here, never re-thrown.
async function sendExpoPush(messages) {
  const valid = messages.filter((m) => isExpoPushToken(m.to));
  if (valid.length === 0) return;
  for (let i = 0; i < valid.length; i += MAX_PER_REQUEST) {
    const chunk = valid.slice(i, i + MAX_PER_REQUEST);
    try {
      const { statusCode, body } = await postJson(EXPO_PUSH_URL, chunk);
      if (statusCode >= 400) {
        console.error('[push] Expo push service returned', statusCode, body);
      }
    } catch (err) {
      console.error('[push] Failed to reach Expo push service:', err.message);
    }
  }
}

// Looks up one user's stored push token and sends them a single
// notification. No-ops silently if they never registered a token - a bot
// account, a real user who denied notification permission, or one who's
// still on Expo Go (see the file-level note above).
async function notifyUser(userId, { title, body, data } = {}) {
  // Required lazily (not at module load) to dodge a require cycle: push.js
  // is required by routes that db.js's own callers sit behind.
  const db = require('./db');
  const user = db.findById('users', userId);
  if (!user || !isExpoPushToken(user.pushToken)) return;
  await sendExpoPush([
    {
      to: user.pushToken,
      title,
      body,
      data: data || {},
      sound: 'default',
      priority: 'high',
    },
  ]);
}

module.exports = { isExpoPushToken, sendExpoPush, notifyUser };
