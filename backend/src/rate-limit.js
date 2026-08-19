// Simple in-memory fixed-window rate limiter, keyed by "ip:bucketName". Good
// enough to blunt basic abuse (credential stuffing, forgot-password/SMS
// spam, upload flooding) on a single-process demo server; swap for a shared
// store (e.g. Redis) if this ever runs as multiple instances behind a load
// balancer, since each process would otherwise track its own counts.
const buckets = new Map();

// Periodically drop expired buckets so this doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60 * 1000).unref();

function createLimiter({ windowMs, max }) {
  return function check(key) {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    return {
      allowed: bucket.count <= max,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  };
}

function clientIp(req) {
  // Only trust X-Forwarded-For when explicitly told this server sits behind
  // a real reverse proxy that sets/overwrites it (set TRUST_PROXY=true).
  // Without that, ANY client can set this header themselves and get a
  // fresh rate-limit bucket on every request, defeating the whole point of
  // rate limiting login/OTP/password-reset - the header is only meaningful
  // once you control the layer in front of Node that sets it.
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

module.exports = { createLimiter, clientIp };
