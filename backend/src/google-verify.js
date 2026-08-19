// Verifies a Google-issued ID token (a RS256-signed JWT) with zero npm
// dependencies: fetch Google's public JWKS over HTTPS (Node's built-in
// `https`), verify the RSA signature with Node's built-in `crypto`, then
// check aud/iss/exp ourselves. This is what `google-auth-library` does under
// the hood, minus the parts we don't need.
const https = require('https');
const crypto = require('crypto');

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

let cachedKeys = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // Google rotates these rarely; 1h cache is plenty.

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Google anahtarları alınamadı (HTTP ${res.statusCode}).`));
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

async function getGoogleKeys() {
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
 * Verifies a Google ID token against `expectedAudience` (your
 * GOOGLE_CLIENT_ID). Throws a user-facing Turkish error message on any
 * failure; returns the decoded payload (email, name, picture, sub, ...) on
 * success.
 */
async function verifyGoogleIdToken(idToken, expectedAudience) {
  if (!expectedAudience) {
    throw new Error(
      'Google ile giriş yapılandırılmamış: backend/.env dosyasına GOOGLE_CLIENT_ID eklemelisin (bkz. .env.example).'
    );
  }

  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Geçersiz Google kimlik jetonu.');
  const [headerB64, payloadB64, signatureB64] = parts;

  let header, payload;
  try {
    header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf8'));
    payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf8'));
  } catch {
    throw new Error('Google kimlik jetonu çözümlenemedi.');
  }
  if (header.alg !== 'RS256') throw new Error('Desteklenmeyen imza algoritması.');

  const keys = await getGoogleKeys();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Google doğrulama anahtarı bulunamadı (anahtarlar yenilenmiş olabilir).');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signature = base64UrlToBuffer(signatureB64);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  if (!verifier.verify(publicKey, signature)) {
    throw new Error('Jeton imzası doğrulanamadı.');
  }

  if (!VALID_ISSUERS.has(payload.iss)) throw new Error('Geçersiz jeton kaynağı.');
  if (payload.aud !== expectedAudience) throw new Error('Bu jeton uygulamamız için verilmemiş.');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('Jetonun süresi dolmuş, tekrar dene.');
  if (!payload.email) throw new Error('Google hesabında bir e-posta bulunamadı.');

  return payload;
}

module.exports = { verifyGoogleIdToken };
