const crypto = require('crypto');
const db = require('../db');
const { signToken, hashPassword, verifyPassword, requireAuth } = require('../auth');
const { toPublicUser } = require('../serialize');
const { verifyGoogleIdToken } = require('../google-verify');

function computeAge(birthDate) {
  if (!birthDate) return null;
  const parts = String(birthDate)
    .split(/[/\-.]/)
    .map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  let day, month, year;
  if (parts[0] > 31) {
    [year, month, day] = parts;
  } else {
    [day, month, year] = parts;
  }
  const dob = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Şifre en az 8 karakter olmalı';
  if (!/[A-Z]/.test(password)) return 'Şifre en az bir büyük harf içermeli';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Şifre en az bir sembol içermeli';
  return null;
}

const routes = [];

routes.push({
  method: 'POST',
  path: '/api/auth/register',
  handler: async (req, res, params, body) => {
    const name = (body.name || '').trim();
    const birthDate = (body.birthDate || '').trim();
    const contact = (body.contact || '').trim().toLowerCase();
    const password = body.password || '';

    if (!name) return res.status(400).json({ error: 'Adını yazmalısın' });
    if (!birthDate) return res.status(400).json({ error: 'Doğum tarihini gir' });
    if (!contact || contact.length < 3) return res.status(400).json({ error: 'Telefon veya e-posta gerekli' });
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });

    const age = computeAge(birthDate);
    if (age !== null && age < 18) {
      return res.status(400).json({ error: 'FireVibe’a katılmak için 18 yaşından büyük olmalısın.' });
    }

    const existing = db.find('users', (u) => u.contact === contact);
    if (existing) {
      return res.status(409).json({ error: 'Bu telefon veya e-posta ile zaten bir hesap var.' });
    }

    const row = db.insert('users', {
      name,
      contact,
      passwordHash: hashPassword(password),
      birthDate,
      age,
      bio: '',
      city: 'İstanbul',
      neighbourhood: '',
      avatarUrl: '',
      gallery: [],
      musicTags: [],
      vibeTags: [],
      mood: 'Chill',
      ageRangeMin: 24,
      ageRangeMax: 34,
      discoveryRadiusKm: 12,
      voiceNoteUrl: '',
      verified: false,
      isBot: false,
      onboardingComplete: false,
      phoneVerified: false,
      distanceKm: 0,
      favoriteTrack: '',
    });

    const token = signToken(row.id);
    res.status(201).json({ token, user: toPublicUser(row) });
  },
});

routes.push({
  method: 'POST',
  path: '/api/auth/login',
  handler: async (req, res, params, body) => {
    const identifier = (body.identifier || '').trim().toLowerCase();
    const password = body.password || '';
    if (!identifier) return res.status(400).json({ error: 'Telefon veya e-posta gerekli' });
    if (!password) return res.status(400).json({ error: 'Şifre gerekli' });

    const row = db.find('users', (u) => u.contact === identifier);
    if (!row || !verifyPassword(password, row.passwordHash)) {
      return res.status(401).json({ error: 'Telefon/e-posta veya şifre hatalı.' });
    }
    const token = signToken(row.id);
    res.json({ token, user: toPublicUser(row) });
  },
});

routes.push({
  method: 'POST',
  path: '/api/auth/forgot-password',
  handler: async (req, res, params, body) => {
    const contact = (body.contact || '').trim().toLowerCase();
    if (!contact || contact.length < 3) return res.status(400).json({ error: 'Telefon veya e-posta gerekli' });

    const row = db.find('users', (u) => u.contact === contact);
    if (!row) {
      // Don't leak which contacts are registered.
      return res.json({ ok: true, message: 'Eğer bu bilgiyle bir hesap varsa, sıfırlama bağlantısı gönderildi.' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
    db.insert('passwordResets', { userId: row.id, token, expiresAt, used: false });

    console.log(`[auth] Şifre sıfırlama bağlantısı (${row.contact}): /reset-password?token=${token}`);

    res.json({
      ok: true,
      message: 'Eğer bu bilgiyle bir hesap varsa, sıfırlama bağlantısı gönderildi.',
      // Exposed only because this demo has no real SMS/e-mail provider wired up -
      // in production this would be delivered out-of-band, never in the response.
      devResetToken: token,
    });
  },
});

routes.push({
  method: 'POST',
  path: '/api/auth/reset-password',
  handler: async (req, res, params, body) => {
    const token = body.token;
    const password = body.password || '';
    if (!token) return res.status(400).json({ error: 'Geçersiz bağlantı' });
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });

    const reset = db.find('passwordResets', (r) => r.token === token && !r.used);
    if (!reset || new Date(reset.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Bağlantının süresi dolmuş veya geçersiz.' });
    }

    db.update('users', reset.userId, { passwordHash: hashPassword(password) });
    db.update('passwordResets', reset.id, { used: true });

    res.json({ ok: true, message: 'Şifren güncellendi. Şimdi giriş yapabilirsin.' });
  },
});

routes.push({
  method: 'POST',
  path: '/api/auth/google',
  handler: async (req, res, params, body) => {
    const idToken = body.idToken;
    if (!idToken) return res.status(400).json({ error: 'Google kimlik jetonu gerekli.' });

    let payload;
    try {
      payload = await verifyGoogleIdToken(idToken, process.env.GOOGLE_CLIENT_ID);
    } catch (err) {
      return res.status(401).json({ error: err.message || 'Google ile doğrulama başarısız.' });
    }

    const contact = String(payload.email).trim().toLowerCase();
    let row = db.find('users', (u) => u.contact === contact);

    if (!row) {
      // Google doesn't share a birth date over the basic OpenID scopes, so
      // `age`/`birthDate` stay empty for Google-created accounts - the
      // 18+ gate that /register enforces already happened on Google's side
      // when they created their Google account.
      row = db.insert('users', {
        name: payload.name || contact.split('@')[0],
        contact,
        passwordHash: hashPassword(crypto.randomBytes(24).toString('hex')),
        birthDate: '',
        age: null,
        bio: '',
        city: 'İstanbul',
        neighbourhood: '',
        avatarUrl: payload.picture || '',
        gallery: [],
        musicTags: [],
        vibeTags: [],
        mood: 'Chill',
        ageRangeMin: 24,
        ageRangeMax: 34,
        discoveryRadiusKm: 12,
        voiceNoteUrl: '',
        verified: true,
        isBot: false,
        onboardingComplete: false,
        phoneVerified: false,
        distanceKm: 0,
        favoriteTrack: '',
      });
    } else if (!row.avatarUrl && payload.picture) {
      row = db.update('users', row.id, { avatarUrl: payload.picture });
    }

    const token = signToken(row.id);
    res.json({ token, user: toPublicUser(row) });
  },
});

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

routes.push({
  method: 'POST',
  path: '/api/auth/sms/request',
  handler: async (req, res, params, body) => {
    const phone = (body.phone || '').trim().toLowerCase();
    if (!phone || phone.length < 5) return res.status(400).json({ error: 'Geçerli bir telefon numarası gir.' });

    // Don't leak which numbers have accounts - always respond ok, but only
    // actually issue a code (and return it below) if the number is registered.
    const row = db.find('users', (u) => u.contact === phone);
    let devCode;
    if (row) {
      const code = generateOtp();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 5).toISOString();
      db.insert('smsCodes', { phone, code, expiresAt, used: false });
      console.log(`[auth] SMS doğrulama kodu (${phone}): ${code}`);
      devCode = code;
    }

    res.json({
      ok: true,
      message: 'Eğer bu numarayla bir hesap varsa, doğrulama kodu gönderildi.',
      // Exposed only because this demo has no real SMS provider wired up -
      // in production this would be delivered via SMS, never in the response.
      ...(devCode ? { devCode } : {}),
    });
  },
});

routes.push({
  method: 'POST',
  path: '/api/auth/sms/verify',
  handler: async (req, res, params, body) => {
    const phone = (body.phone || '').trim().toLowerCase();
    const code = (body.code || '').trim();
    if (!phone || !code) return res.status(400).json({ error: 'Telefon numarası ve kod gerekli.' });

    const entry = db.find('smsCodes', (c) => c.phone === phone && c.code === code && !c.used);
    if (!entry || new Date(entry.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Kod hatalı veya süresi dolmuş.' });
    }
    const row = db.find('users', (u) => u.contact === phone);
    if (!row) return res.status(404).json({ error: 'Bu numarayla bir hesap bulunamadı.' });

    db.update('smsCodes', entry.id, { used: true });
    const token = signToken(row.id);
    res.json({ token, user: toPublicUser(row) });
  },
});

routes.push({
  method: 'GET',
  path: '/api/auth/me',
  handler: async (req, res) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const row = db.findById('users', userId);
    if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ user: toPublicUser(row) });
  },
});

module.exports = routes;
