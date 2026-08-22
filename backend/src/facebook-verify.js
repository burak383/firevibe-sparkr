// Verifies a Facebook access token and fetches the signed-in person's basic
// profile - zero npm dependencies, same style as google-verify.js. Facebook's
// Login flow (unlike Google's) hands the client a plain OAuth access token,
// not a signed JWT, so there's no signature to verify locally: instead we
// call Facebook's own Graph API twice -
//   1. /debug_token - asks Facebook "is this token real, and was it issued
//      to MY app?" using our app id + app secret. This is the step that
//      stops someone from sending us an access token from a DIFFERENT
//      Facebook app and impersonating a user.
//   2. /me - fetches the actual profile (id, name, email) using the
//      now-trusted token.
const https = require('https');

const GRAPH_API_VERSION = 'v21.0';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            reject(new Error('Facebook yanıtı çözümlenemedi.'));
            return;
          }
          // Facebook returns its own JSON error body (with a 400/401 status)
          // rather than an empty response, so resolve either way and let the
          // caller inspect `json.error` - more informative than a generic
          // "HTTP 400" message.
          resolve({ status: res.statusCode, json });
        });
      })
      .on('error', reject);
  });
}

/**
 * Verifies a Facebook access token against `appId`/`appSecret` (your
 * FACEBOOK_APP_ID / FACEBOOK_APP_SECRET) and returns the profile
 * ({ id, name, email }) on success. `email` may be `undefined` - Facebook
 * only includes it if the person granted the "email" permission and has a
 * verified email on their account, both of which are common but not
 * guaranteed. Throws a user-facing Turkish error message on any failure.
 */
async function verifyFacebookAccessToken(accessToken, appId, appSecret) {
  if (!appId || !appSecret) {
    throw new Error(
      'Facebook ile giriş yapılandırılmamış: backend/.env dosyasına FACEBOOK_APP_ID ve FACEBOOK_APP_SECRET eklemelisin (bkz. .env.example).'
    );
  }
  if (!accessToken) {
    throw new Error('Geçersiz Facebook erişim jetonu.');
  }

  const appAccessToken = `${appId}|${appSecret}`;
  const debugUrl =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/debug_token` +
    `?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appAccessToken)}`;

  const { json: debugJson } = await fetchJson(debugUrl);
  if (debugJson.error) {
    throw new Error(`Facebook jetonu doğrulanamadı: ${debugJson.error.message || 'bilinmeyen hata'}`);
  }
  const data = debugJson.data || {};
  if (!data.is_valid) {
    throw new Error('Facebook jetonu geçersiz veya süresi dolmuş, tekrar dene.');
  }
  if (String(data.app_id) !== String(appId)) {
    throw new Error('Bu jeton uygulamamız için verilmemiş.');
  }

  const profileUrl =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me` +
    `?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`;
  const { json: profileJson } = await fetchJson(profileUrl);
  if (profileJson.error) {
    throw new Error(`Facebook profili alınamadı: ${profileJson.error.message || 'bilinmeyen hata'}`);
  }
  if (!profileJson.id) {
    throw new Error('Facebook profili okunamadı.');
  }

  return {
    id: profileJson.id,
    name: profileJson.name || null,
    email: profileJson.email || null,
    picture: profileJson.picture?.data?.url || null,
  };
}

/**
 * Exchanges an OAuth authorization "code" (from the redirect Facebook sends
 * the browser to after the person approves the login dialog) for a real
 * access token - the server-to-server half of the "Authorization Code"
 * flow. `redirectUri` must be byte-for-byte the same URI that was used to
 * start the login (Facebook checks this to stop a stolen code from being
 * redeemed from a different context). This exchange requires `appSecret`,
 * which is exactly why it has to happen here on the backend and not on the
 * phone - the app secret must never ship inside the mobile app.
 */
async function exchangeFacebookCode(code, appId, appSecret, redirectUri) {
  if (!appId || !appSecret) {
    throw new Error(
      'Facebook ile giriş yapılandırılmamış: backend/.env dosyasına FACEBOOK_APP_ID ve FACEBOOK_APP_SECRET eklemelisin (bkz. .env.example).'
    );
  }
  if (!code) throw new Error('Facebook yetkilendirme kodu gerekli.');

  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&code=${encodeURIComponent(code)}`;

  const { json } = await fetchJson(url);
  if (json.error) {
    throw new Error(`Facebook kodu değiştirilemedi: ${json.error.message || 'bilinmeyen hata'}`);
  }
  if (!json.access_token) {
    throw new Error('Facebook erişim jetonu alınamadı.');
  }
  return json.access_token;
}

module.exports = { verifyFacebookAccessToken, exchangeFacebookCode };
