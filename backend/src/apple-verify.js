// Verifies an Apple-issued identity token (a RS256-signed JWT) with zero npm
// dependencies - the exact same approach as google-verify.js, just pointed
// at Apple's own JWKS endpoint and issuer/audience instead of Google's. This
// is what `apple-signin-auth`/`verify-apple-id-token` do under the hood.
//
// SETUP (not something I can do from here - needs your own Apple Developer
// account, which you don't have yet per earlier notes on this project):
//   1. Enable "Sign in with Apple" as a capability on your app's identifier
//      in the Apple Developer portal (Certificates, Identifiers & Profiles).
//   2. `expectedAudience` below should be your app's bundle identifier (e.g.
//      com.sparkr.app) for a native iOS sign-in - that's what ends up in the
//      identity token's `aud` claim from `expo-apple-authentication`.
//   3. Set APPLE_CLIENT_ID in this backend's env to that same bundle id.
//
// CANNOT BE TESTED FROM THIS SANDBOX, AND WON'T RUN WITHOUT A REAL APPLE
// DEVELOPER ACCOUNT + A REAL iOS DEVICE/SIMULATOR: Sign in with Apple can
// only be triggered from a real device signed into iCloud (or the iOS
// Simulator on a Mac), never from this sandbox or from Expo Go. The parsing
// below follows Apple's documented token format
// (https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens)
// as closely as possible, but treat it as unverified until tried for real.
const https = require('https');
const crypto = require('crypto');

const JWKS_URL = 'https://appleid.apple.com/auth/keys';
const EXPECTED_ISSUER = 'https://appleid.apple.com';

let cachedKeys = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // Apple rotates these rarely; 1h cache is plenty.

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Apple anahtarları alınamadı (HTTP ${res.statusCode}).`));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

async function getAppleKeys() {
  if (cachedKeys && Date.now() - cachedAt < CACHE_TTL_MS) return cachedKeys;
  const data = await fetchJson(JWKS_URL);
  cachedKeys = data.keys || [];
  cachedAt = Date.now();
  return cachedKeys;
}

function base64UrlToBuffer(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Verifies an Apple identity token against `expectedAudience` (your app's
 * bundle id / APPLE_CLIENT_ID). Throws a user-facing Turkish error message
 * on any failure; returns the decoded payload (sub, email, email_verified,
 * is_private_email, ...) on success.
 *
 * NOTE: unlike Google, Apple only includes `email` in the token on the
 * FIRST authorization a person ever grants your app - every later sign-in
 * omits it. `payload.sub` is Apple's stable per-app user identifier and is
 * ALWAYS present; routes/auth.js keys accounts off that, not off email, for
 * exactly this reason (see its `appleUserId` field).
 */
async function verifyAppleIdToken(idToken, expectedAudience) {
  if (!expectedAudience) {
    throw new Error(
      'Apple ile giriş yapılandırılmamış: backend/.env dosyasına APPLE_CLIENT_ID eklemelisin (bkz. .env.example).'
    );
  }

  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Geçersiz Apple kimlik jetonu.');
  const [headerB64, payloadB64, signatureB64] = parts;

  let header, payload;
  try {
    header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf8'));
    payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf8'));
  } catch {
    throw new Error('Apple kimlik jetonu çözümlenemedi.');
  }
  if (header.alg !== 'RS256') throw new Error('Desteklenmeyen imza algoritması.');

  const keys = await getAppleKeys();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Apple doğrulama anahtarı bulunamadı (anahtarlar yenilenmiş olabilir).');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signature = base64UrlToBuffer(signatureB64);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  if (!verifier.verify(publicKey, signature)) {
    throw new Error('Jeton imzası doğrulanamadı.');
  }

  if (payload.iss !== EXPECTED_ISSUER) throw new Error('Geçersiz jeton kaynağı.');
  if (payload.aud !== expectedAudience) throw new Error('Bu jeton uygulamamız için verilmemiş.');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('Jetonun süresi dolmuş, tekrar dene.');
  if (!payload.sub) throw new Error('Apple hesabı için bir kimlik bulunamadı.');

  return payload;
}

module.exports = { verifyAppleIdToken };
