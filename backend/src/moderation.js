// Zero-dependency content moderation for images, voice notes, and text sent
// through the app - hooked into routes/uploads.js (photos + voice notes,
// including chat images and profile "Voice Vibe" recordings) and
// routes/messages.js (chat text). Two external services do the actual
// detection, both called with only Node's built-in `https`/`crypto` (no npm
// packages, matching this backend's zero-dependency design):
//
//  - Google Cloud Vision's SAFE_SEARCH_DETECTION, for images. Needs a GCP
//    service account with the Vision API enabled - see
//    GOOGLE_SERVICE_ACCOUNT_JSON below. https://cloud.google.com/vision/docs/detecting-safe-search
//  - OpenAI's Whisper API, to transcribe voice notes to text, which then
//    runs through the same word-list filter as chat text. This only catches
//    SPOKEN profanity/sexual talk - there's no cheap, zero-dependency way to
//    classify wordless audio content (moans, etc.) itself, only what's said.
//
// BOTH SERVICES ARE PAID (see the delivery message for current pricing) and
// BOTH ARE OPTIONAL: if their env var isn't set, that one check is skipped
// entirely (fails OPEN - the upload/message goes through unmoderated) and a
// warning is logged, so the app keeps working before you've set these up;
// it just isn't moderating images/audio yet. The text filter below has no
// such dependency and always runs.
const https = require('https');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Text filter (also used on Whisper transcripts - see checkAudioSafety)
// ---------------------------------------------------------------------------

// Best-effort blocklist, NOT exhaustive - edit this list as needed, it's
// plain JS. Roots of length >= 4 are matched as a SUBSTRING anywhere in the
// message, since Turkish suffixes attach directly to a word root (e.g.
// "siktir" also has to catch "siktirgit"); this also catches evasion via
// punctuation ("s.i.k.t.i.r") because punctuation is stripped before
// matching. Short/ambiguous roots are matched only as a WHOLE WORD instead,
// so they don't flag unrelated words that happen to contain them (e.g.
// "göt" inside "götürmek").
const SUBSTRING_ROOTS = [
  'siktir', 'sikeyim', 'sikis', 'sikik', 'orospu', 'kahpe', 'pezevenk',
  'gotveren', 'yarrak', 'yarrag', 'amcik',
  'ibne', 'kaltak', 'surtuk', 'dallama', 'yavsak',
  'fuck', 'motherfucker', 'cunt', 'whore', 'porno', 'pornografi', 'nude',
  'ciplak', 'sekstape', 'nsfw',
];
const WHOLE_WORD_ROOTS = new Set(['sik', 'got', 'pic', 'sex', 'seks', 'shit', 'ass', 'amk', 'am']);

function foldTurkish(str) {
  return str
    .toLocaleLowerCase('tr')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');
}

function containsBlockedText(text) {
  if (!text || typeof text !== 'string') return false;
  const folded = foldTurkish(text);
  const stripped = folded.replace(/[^a-z0-9]/g, '');
  for (const root of SUBSTRING_ROOTS) {
    if (stripped.includes(root)) return true;
  }
  const words = folded.split(/[^a-z0-9]+/).filter(Boolean);
  for (const w of words) {
    if (WHOLE_WORD_ROOTS.has(w)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Shared HTTP helpers (JSON / form-encoded / multipart POST over https)
// ---------------------------------------------------------------------------

function postJson(url, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload));
    const req = https.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, ...headers } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
            /* non-JSON response - caller sees statusCode + raw body */
          }
          resolve({ statusCode: res.statusCode, body: json ?? body });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function postForm(url, params) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(new URLSearchParams(params).toString());
    const req = https.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
            /* ignore */
          }
          resolve({ statusCode: res.statusCode, body: json ?? body });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function postMultipart(url, { fields = {}, file }, headers = {}) {
  return new Promise((resolve, reject) => {
    const boundary = `----firevibe${crypto.randomBytes(16).toString('hex')}`;
    const parts = [];
    for (const [key, value] of Object.entries(fields)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
    }
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
      )
    );
    parts.push(file.buffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const data = Buffer.concat(parts);

    const req = https.request(
      url,
      { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': data.length, ...headers } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
            /* ignore */
          }
          resolve({ statusCode: res.statusCode, body: json ?? body });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function base64Url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Google Cloud Vision SafeSearch (images)
// ---------------------------------------------------------------------------

let cachedToken = null;
let cachedTokenExp = 0;
let loggedMissingVisionConfig = false;

function getServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.error('[moderation] GOOGLE_SERVICE_ACCOUNT_JSON geçerli bir JSON değil.');
    return null;
  }
}

// Exchanges the service account's private key for a short-lived OAuth2
// access token (the standard Google "JWT bearer" flow), signing the
// assertion ourselves with Node's built-in crypto instead of pulling in
// `google-auth-library`. Cached until ~1 minute before it expires.
async function getVisionAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExp - 60_000) return cachedToken;

  const sa = getServiceAccount();
  if (!sa || !sa.client_email || !sa.private_key) {
    if (!loggedMissingVisionConfig) {
      console.warn('[moderation] Görsel denetimi devre dışı: GOOGLE_SERVICE_ACCOUNT_JSON ayarlanmamış.');
      loggedMissingVisionConfig = true;
    }
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-vision',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  signer.end();
  const signature = base64Url(signer.sign(sa.private_key));
  const assertion = `${header}.${claims}.${signature}`;

  const { statusCode, body } = await postForm('https://oauth2.googleapis.com/token', {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  if (statusCode !== 200 || !body || !body.access_token) {
    console.error('[moderation] Google erişim jetonu alınamadı:', statusCode, body);
    return null;
  }
  cachedToken = body.access_token;
  cachedTokenExp = Date.now() + (body.expires_in || 3600) * 1000;
  return cachedToken;
}

const HIGH_RISK_LIKELIHOOD = new Set(['LIKELY', 'VERY_LIKELY']);

// Returns { flagged, reason } - or { flagged: false, skipped: true } when the
// check couldn't run at all (no config, or the API call itself failed).
// Deliberately FAILS OPEN: a Vision outage or a missing key must never block
// every photo upload in the app, it just means that upload goes through
// unmoderated (same trade-off routes/push.js makes for notifications).
async function checkImageSafety(buffer) {
  let token;
  try {
    token = await getVisionAccessToken();
  } catch (err) {
    console.error('[moderation] Vision kimlik doğrulama hatası:', err.message);
    return { flagged: false, skipped: true };
  }
  if (!token) return { flagged: false, skipped: true };

  let result;
  try {
    result = await postJson(
      'https://vision.googleapis.com/v1/images:annotate',
      { requests: [{ image: { content: buffer.toString('base64') }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }] },
      { Authorization: `Bearer ${token}` }
    );
  } catch (err) {
    console.error('[moderation] Vision API çağrısı başarısız:', err.message);
    return { flagged: false, skipped: true };
  }
  if (result.statusCode !== 200) {
    console.error('[moderation] Vision API hata döndürdü:', result.statusCode, result.body);
    return { flagged: false, skipped: true };
  }

  const annotation = result.body && result.body.responses && result.body.responses[0] && result.body.responses[0].safeSearchAnnotation;
  if (!annotation) return { flagged: false, skipped: true };

  if (HIGH_RISK_LIKELIHOOD.has(annotation.adult) || HIGH_RISK_LIKELIHOOD.has(annotation.racy)) {
    return { flagged: true, reason: 'Bu görsel cinsel içerik barındırıyor olabilir.' };
  }
  return { flagged: false };
}

// ---------------------------------------------------------------------------
// OpenAI Whisper (voice notes -> transcript -> text filter)
// ---------------------------------------------------------------------------

async function transcribeAudio(buffer, ext) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const { statusCode, body } = await postMultipart(
    'https://api.openai.com/v1/audio/transcriptions',
    { fields: { model: 'whisper-1' }, file: { buffer, filename: `voice.${ext}`, contentType: 'application/octet-stream' } },
    { Authorization: `Bearer ${apiKey}` }
  );
  if (statusCode !== 200 || !body || typeof body.text !== 'string') {
    console.error('[moderation] Whisper transkripsiyon hatası:', statusCode, body);
    return null;
  }
  return body.text;
}

let loggedMissingWhisperConfig = false;

// Same fail-open contract as checkImageSafety above.
async function checkAudioSafety(buffer, ext) {
  if (!process.env.OPENAI_API_KEY) {
    if (!loggedMissingWhisperConfig) {
      console.warn('[moderation] Ses denetimi devre dışı: OPENAI_API_KEY ayarlanmamış.');
      loggedMissingWhisperConfig = true;
    }
    return { flagged: false, skipped: true };
  }

  let text;
  try {
    text = await transcribeAudio(buffer, ext);
  } catch (err) {
    console.error('[moderation] Whisper çağrısı başarısız:', err.message);
    return { flagged: false, skipped: true };
  }
  if (text == null) return { flagged: false, skipped: true };

  if (containsBlockedText(text)) {
    return { flagged: true, reason: 'Bu ses kaydında küfür veya cinsel içerikli konuşma tespit edildi.' };
  }
  return { flagged: false };
}

module.exports = { containsBlockedText, checkImageSafety, checkAudioSafety };
