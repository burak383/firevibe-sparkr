const crypto = require('crypto');
const db = require('../db');
const { signToken, hashPassword, verifyPassword, requireAuth } = require('../auth');
const { toPublicUser } = require('../serialize');
const { verifyGoogleIdToken } = require('../google-verify');
const { verifyAppleIdToken } = require('../apple-verify');
const { containsBlockedText } = require('../moderation');
const { computeAge } = require('../age');

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Şifre en az 8 karakter olmalı';
  if (!/[A-Z]/.test(password)) return 'Şifre en az bir büyük harf içermeli';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Şifre en az bir sembol içermeli';
  return null;
}

// Register/login match on an exact string, but a phone number can be
// typed a dozen equivalent ways (spaces, dashes, leading 0 vs +90 country
// code) - without normalizing, "0532 123 45 67" at signup and "05321234567"
// at login silently fail to match. E-mails are left untouched beyond
// trim+lowercase (already applied by callers); only digit-looking contacts
// get reshaped into a canonical +90XXXXXXXXXX form.
function normalizeContact(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value || value.includes('@')) return value;

  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return value;

  let national = digits;
  if (digits.startsWith('90') && digits.length === 12) {
    national = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    national = digits.slice(1);
  }
  return `+90${national}`;
}

const routes = [];

routes.push({
  method: 'POST',
  path: '/api/auth/register',
  handler: async (req, res, params, body) => {
    const name = (body.name || '').trim();
    const birthDate = (body.birthDate || '').trim();
    const contact = normalizeContact(body.contact);
    const password = body.password || '';

    if (!name) return res.status(400).json({ error: 'Adını yazmalısın' });
    // Profile fields are also moderated on edit (routes/users.js) - checked
    // here too since a display name is set at signup, before that route is
    // ever hit, and is shown on the profile just the same.
    if (containsBlockedText(name)) {
      return res.status(422).json({ error: 'Adında küfür veya cinsel içerikli bir ifade var, başka bir isim dene.' });
    }
    if (!birthDate) return res.status(400).json({ error: 'Doğum tarihini gir' });
    if (!contact || contact.length < 3) return res.status(400).json({ error: 'Telefon veya e-posta gerekli' });
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });

    const age = computeAge(birthDate);
    // computeAge returns null for anything it can't parse as a real date -
    // that USED to be treated as "can't check, let it through", which meant
    // sending any unparseable birthDate (garbage text, wrong format) skipped
    // the 18+ gate entirely and stored age: null. Reject it outright instead
    // - the mobile app's own register screen already only ever sends a
    // GG/AA/YYYY string, so this can't affect a real signup through the app.
    if (age === null) {
      return res.status(400).json({ error: 'Doğum tarihini GG/AA/YYYY formatında gir.' });
    }
    if (age < 18) {
      return res.status(400).json({ error: 'SparkR’a katılmak için 18 yaşından büyük olmalısın.' });
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
      // Placeholder city above, not a real one - see routes/users.js's
      // location-lock logic. Left false here so the app asks for (and then
      // permanently locks in) the person's real GPS-detected city right
      // after this first login, instead of letting "İstanbul" silently
      // stick around as their location forever.
      locationConfirmed: false,
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
    const identifier = normalizeContact(body.identifier);
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
    const contact = normalizeContact(body.contact);
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
      // Exposed only because this demo has no real e-mail provider wired up -
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
        locationConfirmed: false,
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

routes.push({
  method: 'POST',
  path: '/api/auth/apple',
  handler: async (req, res, params, body) => {
    const idToken = body.idToken;
    if (!idToken) return res.status(400).json({ error: 'Apple kimlik jetonu gerekli.' });

    let payload;
    try {
      payload = await verifyAppleIdToken(idToken, process.env.APPLE_CLIENT_ID);
    } catch (err) {
      return res.status(401).json({ error: err.message || 'Apple ile doğrulama başarısız.' });
    }

    // Apple's `sub` (its own stable per-app user id) is ALWAYS present, but
    // `email` is only ever included in the token on the very FIRST
    // authorization someone grants this app - every later sign-in comes
    // back without it. So accounts are keyed primarily on `appleUserId`
    // (=sub), with `contact` only used as a fallback lookup/display value -
    // the opposite priority from the Google route above, where
    // email is always present and is the primary key.
    let row = db.find('users', (u) => u.appleUserId === payload.sub);

    if (!row && payload.email) {
      // First-time sign-in, or an existing email/password/Google
      // account whose address happens to match this Apple ID - link them
      // rather than creating a duplicate account. Apple only reports
      // `email` once verified on Apple's side, so this is as trustworthy as
      // the Google linking case above.
      row = db.find('users', (u) => u.contact === String(payload.email).trim().toLowerCase());
    }

    if (row) {
      if (!row.appleUserId) row = db.update('users', row.id, { appleUserId: payload.sub });
    } else {
      // `fullName` only ever arrives from the CLIENT (Apple hands it to the
      // app directly on the native sign-in sheet, never inside the identity
      // token itself, and only on that same first authorization) - see
      // src/utils/appleAuth.ts. Falls back to a synthetic contact when
      // there's no email to key on either (a private-relay email is still a
      // usable one - `is_private_email` just means Apple is forwarding it,
      // not that it's absent).
      const contact = payload.email
        ? String(payload.email).trim().toLowerCase()
        : `apple_${payload.sub}@apple.sparkr`;
      // Same known gap as Google above: Apple doesn't share a
      // birth date, so age/birthDate stay empty - the 18+ gate already ran
      // on Apple's side (Apple ID's own minimum age) when this iCloud
      // account was created.
      row = db.insert('users', {
        name: (typeof body.fullName === 'string' && body.fullName.trim()) || contact.split('@')[0],
        contact,
        appleUserId: payload.sub,
        passwordHash: hashPassword(crypto.randomBytes(24).toString('hex')),
        birthDate: '',
        age: null,
        bio: '',
        city: 'İstanbul',
        neighbourhood: '',
        locationConfirmed: false,
        avatarUrl: '',
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
    }

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
