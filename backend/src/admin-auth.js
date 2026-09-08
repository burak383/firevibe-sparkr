// Minimal HTTP Basic Auth gate for the /admin* routes (routes/admin.js) -
// zero dependencies, consistent with the rest of this backend. Username is
// always "admin"; the password is the ADMIN_SECRET env var. Leaving
// ADMIN_SECRET unset disables /admin entirely (503) rather than falling
// back to some default password nobody remembered to change.
const crypto = require('crypto');

function timingSafeEqualStr(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  // Buffers of different length would throw in timingSafeEqual - pad the
  // shorter one so the length itself doesn't leak via an early throw,
  // then still compare real equality afterwards.
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, Buffer.alloc(aBuf.length));
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function requireAdmin(req, res) {
  const secret = process.env.ADMIN_SECRET || '';
  if (!secret) {
    res.status(503).json({
      error: 'Admin paneli yapılandırılmamış: backend/.env dosyasına ADMIN_SECRET eklemelisin.',
    });
    return false;
  }

  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const user = sep === -1 ? decoded : decoded.slice(0, sep);
    const pass = sep === -1 ? '' : decoded.slice(sep + 1);
    if (user === 'admin' && timingSafeEqualStr(pass, secret)) {
      return true;
    }
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="SparkR Admin"');
  res.status(401).json({ error: 'Yetkilendirme gerekli.' });
  return false;
}

module.exports = { requireAdmin };
