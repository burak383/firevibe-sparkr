const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { requireAuth } = require('../auth');
const { UPLOAD_DIR } = require('../uploads-dir');
const { checkImageSafety, checkAudioSafety } = require('../moderation');

// Zero-dependency "object storage": accepts a base64 data URL and writes it
// to disk under backend/data/uploads/, then hands back a URL the server
// serves statically (see the /uploads/ handler in server.js). Good enough
// for a demo; swap for S3/Cloudinary/etc. before shipping to real users.

const IMAGE_MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const AUDIO_MIME_TO_EXT = {
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

const MIME_TO_EXT = { ...IMAGE_MIME_TO_EXT, ...AUDIO_MIME_TO_EXT };

// ~8MB of base64 text is roughly ~6MB of decoded binary - plenty for a
// compressed photo or a short voice note, small enough to keep the
// zero-dependency JSON-body reader (see http-helpers.js) happy.
const MAX_BASE64_LENGTH = 8 * 1024 * 1024;

const routes = [];

routes.push({
  method: 'POST',
  path: '/api/uploads',
  handler: async (req, res, params, body) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;

    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl.trim() : '';
    const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      return res
        .status(400)
        .json({ error: 'Geçersiz dosya verisi. "dataUrl" alanı data:<mime>;base64,<...> biçiminde olmalı.' });
    }

    const [, mimeType, base64] = match;
    const ext = MIME_TO_EXT[mimeType.toLowerCase()];
    if (!ext) {
      return res.status(400).json({ error: `Desteklenmeyen dosya türü: ${mimeType}` });
    }
    if (base64.length > MAX_BASE64_LENGTH) {
      return res.status(413).json({ error: 'Dosya çok büyük (maksimum ~6MB).' });
    }

    let buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch {
      return res.status(400).json({ error: 'Dosya çözümlenemedi.' });
    }
    if (!buffer.length) {
      return res.status(400).json({ error: 'Boş dosya gönderildi.' });
    }

    // Content moderation (see ../moderation.js) - runs on EVERY upload through
    // this one endpoint, so it covers chat photos, profile photos, selfie
    // verification, and voice notes alike. Fails open if the underlying
    // service isn't configured or errors out (see that file's header comment)
    // - only an actual LIKELY/VERY_LIKELY detection blocks the upload.
    const isImage = mimeType.toLowerCase().startsWith('image/');
    const isAudio = mimeType.toLowerCase().startsWith('audio/');
    if (isImage) {
      const { flagged, reason } = await checkImageSafety(buffer);
      if (flagged) {
        return res.status(422).json({ error: reason || 'Bu görsel paylaşım kurallarımıza aykırı görünüyor.' });
      }
    } else if (isAudio) {
      const { flagged, reason } = await checkAudioSafety(buffer, ext);
      if (flagged) {
        return res.status(422).json({ error: reason || 'Bu ses kaydı paylaşım kurallarımıza aykırı görünüyor.' });
      }
    }

    const filename = `${userId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

    const host = req.headers.host || 'localhost';
    const proto = req.headers['x-forwarded-proto'] || 'http';
    res.status(201).json({ url: `${proto}://${host}/uploads/${filename}` });
  },
});

module.exports = routes;
