// One-off script: creates and fully onboards a dedicated Google Play (and,
// later, App Store) reviewer account against the LIVE production backend, so
// whoever reviews the app lands straight in the main app (deck/matches/chat/
// premium paywall all reachable) instead of getting stuck in onboarding.
//
// Run this from your own computer (not from the Claude sandbox - Render's
// edge blocked requests from there with a bare 403, this needs to run from a
// normal residential/office network): `node setup-review-account.js`
// Needs nothing but Node itself - no npm install required.
const https = require('https');

const HOST = 'firevibe-sparkr-backend.onrender.com';
const EMAIL = 'googleplay.review@sparkr.app';
const PASSWORD = 'SparkR2026!Review';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = data.length;
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const r = https.request(
      { hostname: HOST, path, method, headers, timeout: 60000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            /* non-JSON response */
          }
          resolve({ status: res.statusCode, body: json, raw });
        });
      }
    );
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('timeout - Render free tier can take 50s+ to wake up, try again')));
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  console.log('Registering (or logging into) the review account...');
  let token;
  const reg = await req('POST', '/api/auth/register', {
    name: 'SparkR Review',
    birthDate: '01/01/1996',
    contact: EMAIL,
    password: PASSWORD,
  });

  if (reg.status === 201) {
    token = reg.body.token;
    console.log('Created new account.');
  } else if (reg.status === 409) {
    console.log('Account already exists, logging in instead...');
    const login = await req('POST', '/api/auth/login', { identifier: EMAIL, password: PASSWORD });
    if (login.status !== 200) {
      console.error('Login failed:', login.status, login.raw);
      return;
    }
    token = login.body.token;
  } else {
    console.error('Unexpected register response:', reg.status, reg.raw);
    return;
  }

  console.log('Completing onboarding (vibe-setup)...');
  const setup = await req(
    'POST',
    '/api/users/me/vibe-setup',
    {
      mood: 'Chill',
      musicTags: ['Indie Rock', 'R&B'],
      vibeTags: ['Gece Yürüyüşü', 'Canlı Müzik', 'Kahve Sohbeti'],
      ageRangeMin: 22,
      ageRangeMax: 35,
      discoveryRadiusKm: 20,
      favoriteTrack: '',
    },
    token
  );
  console.log('vibe-setup:', setup.status, setup.body && setup.body.user ? { onboardingComplete: setup.body.user.onboardingComplete } : setup.raw);

  console.log('Filling in profile details...');
  const patch = await req(
    'PUT',
    '/api/users/me',
    { bio: 'Google Play inceleme hesabı.', city: 'İstanbul', neighbourhood: 'Kadıköy' },
    token
  );
  console.log('profile patch:', patch.status, patch.body && patch.body.user ? { bio: patch.body.user.bio, city: patch.body.user.city } : patch.raw);

  const me = await req('GET', '/api/auth/me', null, token);
  console.log('\nFinal account state:');
  console.log(
    me.status,
    me.body && me.body.user
      ? { id: me.body.user.id, name: me.body.user.name, onboardingComplete: me.body.user.onboardingComplete, swipeStatus: me.body.user.swipeStatus }
      : me.raw
  );
  console.log('\nDone. Login credentials for the Play Console form:');
  console.log('  Email:', EMAIL);
  console.log('  Password:', PASSWORD);
})().catch((e) => console.error('Script error:', e.message));
