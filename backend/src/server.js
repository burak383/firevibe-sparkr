require('./env');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const { readBody, enhanceResponse, compilePattern } = require('./http-helpers');
const { ensureSeeded } = require('./seed');
const { UPLOAD_DIR } = require('./uploads-dir');
const { createLimiter, clientIp } = require('./rate-limit');

ensureSeeded();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const discoveryRoutes = require('./routes/discovery');
const { routes: matchRoutes } = require('./routes/matches');
const messageRoutes = require('./routes/messages');
const radarRoutes = require('./routes/radar');
const uploadRoutes = require('./routes/uploads');
const { routes: safetyRoutes } = require('./routes/safety');
const subscriptionRoutes = require('./routes/subscription');

const routeTable = [
  ...authRoutes,
  ...userRoutes,
  ...discoveryRoutes,
  ...matchRoutes,
  ...messageRoutes,
  ...radarRoutes,
  ...uploadRoutes,
  ...safetyRoutes,
  ...subscriptionRoutes,
].map((route) => ({ ...route, match: compilePattern(route.path) }));

const UPLOAD_MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
};

// Serves files written by POST /api/uploads (see routes/uploads.js). Only
// filenames matching our own generated pattern are allowed, so this can't
// be used to read arbitrary files off disk.
function serveUpload(res, pathname) {
  const filename = pathname.slice('/uploads/'.length);
  if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) {
    return res.status(400).json({ error: 'Geçersiz dosya adı' });
  }
  const filePath = path.join(UPLOAD_DIR, filename);
  if (path.dirname(filePath) !== UPLOAD_DIR) {
    return res.status(400).json({ error: 'Geçersiz yol' });
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.status(404).json({ error: 'Dosya bulunamadı' });
      return;
    }
    const ext = path.extname(filename).toLowerCase();
    res.setHeader('Content-Type', UPLOAD_MIME_BY_EXT[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.statusCode = 200;
    res.end(data);
  });
}

// Credential/OTP endpoints get a strict limit (brute force / SMS-bombing
// protection); uploads get a moderate limit (disk-flood protection); every
// other /api/* route gets a generous general limit that comfortably covers
// normal usage (e.g. the chat screen polls every 2.5s) while still catching
// a runaway client or basic scraping.
const AUTH_LIMIT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/sms/request',
  '/api/auth/sms/verify',
  '/api/auth/google',
]);

const authLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const uploadLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 60 });
const generalLimiter = createLimiter({ windowMs: 5 * 60 * 1000, max: 600 });

function checkRateLimit(req, pathname) {
  const ip = clientIp(req);
  if (AUTH_LIMIT_PATHS.has(pathname)) return authLimiter(`auth:${ip}`);
  if (pathname === '/api/uploads') return uploadLimiter(`upload:${ip}`);
  if (pathname.startsWith('/api/')) return generalLimiter(`general:${ip}`);
  return { allowed: true, retryAfterSec: 0 };
}

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

function applyCors(req, res) {
  const origin = CORS_ORIGIN === '*' ? '*' : req.headers.origin || CORS_ORIGIN;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

const server = http.createServer(async (req, res) => {
  enhanceResponse(res);
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');
  const pathSegments = decodeURIComponent(url.pathname).split('/').filter(Boolean);
  // Normalized to a single canonical form (no trailing slash, no doubled
  // slashes) BEFORE any exact-string matching happens below. Route matching
  // itself only ever looks at pathSegments (see compilePattern), so it was
  // already immune to "/api/auth/login/" vs "/api/auth/login" - but the
  // rate-limit check and the two early-return routes below used to compare
  // the raw pathname directly, so a trailing/doubled slash reached the real
  // login/OTP handler while silently skipping the strict rate limiter (it
  // fell through to the ~30x more permissive general one instead).
  const pathname = '/' + pathSegments.join('/');
  const query = Object.fromEntries(url.searchParams.entries());

  if (req.method === 'GET' && pathname === '/api/health') {
    return res.json({ ok: true, name: 'SparkR / FireVibe API', time: new Date().toISOString() });
  }

  if (req.method === 'GET' && pathname.startsWith('/uploads/')) {
    return serveUpload(res, pathname);
  }

  const limit = checkRateLimit(req, pathname);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSec));
    return res.status(429).json({ error: 'Çok fazla istek gönderildi. Biraz sonra tekrar dene.' });
  }

  const started = Date.now();

  try {
    let body = {};
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      body = await readBody(req);
    }

    for (const route of routeTable) {
      if (route.method !== req.method) continue;
      const params = route.match(pathSegments);
      if (!params) continue;

      await route.handler(req, res, params, body, query);

      if (!res.writableEnded) res.end();
      console.log(`${req.method} ${pathname} -> ${res.statusCode} (${Date.now() - started}ms)`);
      return;
    }

    res.status(404).json({ error: 'Bulunamadı' });
  } catch (err) {
    console.error(`[error] ${req.method} ${pathname}:`, err);
    if (!res.headersSent) {
      const message = err.message === 'Geçersiz JSON gövdesi' ? err.message : 'Sunucu hatası';
      res.status(err.message === 'Geçersiz JSON gövdesi' ? 400 : 500).json({ error: message });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

const PORT = Number(process.env.PORT) || 4000;
server.listen(PORT, () => {
  console.log(`[server] SparkR API listening on http://localhost:${PORT}`);
  console.log('[server] Demo login (bot accounts, for browsing only): deniz@firevibe.app / firevibe-bot-not-a-real-login');
});

module.exports = server;
