const db = require('../db');
const { requireAuth } = require('../auth');
const { loadMyMatch } = require('./matches');
const { otherUserId } = require('../matching');
const { notifyUser } = require('../push');
const { containsBlockedText } = require('../moderation');

// Ephemeral (non-persisted) "is typing" state, keyed by matchId.
const typingState = new Map();

function serializeMessage(row) {
  return {
    id: row.id,
    matchId: row.matchId,
    senderId: row.senderId,
    text: row.text,
    imageUrl: row.imageUrl,
    createdAt: row.createdAt,
  };
}

const BOT_REPLIES = [
  'Kesinlikle. Sonra sahile ineriz.',
  'Fire Hour başlayınca oraya doğru geçelim mi?',
  'Bu gece vibe’ın çok iyi, devam edelim 🔥',
  'Kadıköy’de yeni bir mekan buldum, anlatayım.',
  'Haklısın, o şarkı geceyi hep uzatıyor.',
  'Az sonra müsait olurum, birazdan yazarım.',
  'Fotoğrafı beğendim, orası neresi?',
  'Bu gece Fire Hour’da buluşalım mı?',
];

const routes = [];

routes.push({
  method: 'GET',
  path: '/api/matches/:id/messages',
  handler: async (req, res, params, body, query) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const match = loadMyMatch(Number(params.id), userId);
    if (!match) return res.status(404).json({ error: 'Eşleşme bulunamadı' });

    let rows = db.filter('messages', (m) => m.matchId === match.id).sort((a, b) => a.id - b.id);
    const afterId = Number(query.afterId);
    if (Number.isFinite(afterId) && afterId > 0) {
      rows = rows.filter((m) => m.id > afterId);
    }

    const typing = typingState.get(match.id);
    const otherTyping = !!(typing && typing.userId !== userId && typing.until > Date.now());

    res.json({
      messages: rows.map(serializeMessage),
      myUserId: userId,
      otherTyping,
    });
  },
});

routes.push({
  method: 'POST',
  path: '/api/matches/:id/messages',
  handler: async (req, res, params, body) => {
    const userId = requireAuth(req, res);
    if (userId === null) return;
    const match = loadMyMatch(Number(params.id), userId);
    if (!match) return res.status(404).json({ error: 'Eşleşme bulunamadı' });

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : '';
    if (!text && !imageUrl) return res.status(400).json({ error: 'Mesaj boş olamaz' });

    // Text half of the same content-moderation pass as images/voice notes
    // (see ../moderation.js) - free to run (no external API), so it applies
    // even though only voice/image moderation was explicitly requested.
    // Images sent as `imageUrl` were already checked at upload time in
    // routes/uploads.js, before this endpoint ever sees the URL.
    if (text && containsBlockedText(text)) {
      return res.status(422).json({ error: 'Bu mesaj küfür veya cinsel içerik barındırdığı için gönderilemedi.' });
    }

    const row = db.insert('messages', {
      matchId: match.id,
      senderId: userId,
      text: text || null,
      imageUrl: imageUrl || null,
    });

    const otherId = otherUserId(match, userId);
    const other = db.findById('users', otherId);
    const sender = db.findById('users', userId);

    if (other && other.isBot) {
      typingState.set(match.id, { userId: other.id, until: Date.now() + 1600 });
      setTimeout(() => {
        const reply = BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)];
        db.insert('messages', { matchId: match.id, senderId: other.id, text: reply, imageUrl: null });
        typingState.delete(match.id);
        // The bot "sent" this reply to the human - let them know if the app
        // isn't open, same as a real person's message would.
        notifyUser(userId, {
          title: other.name,
          body: reply,
          data: { type: 'message', matchId: match.id },
        }).catch(() => {});
      }, 1400 + Math.random() * 1200);
    } else if (other) {
      notifyUser(other.id, {
        title: sender ? sender.name : 'Yeni mesaj',
        body: text || (imageUrl ? 'Bir fotoğraf gönderdi 📷' : 'Yeni mesaj'),
        data: { type: 'message', matchId: match.id },
      }).catch(() => {});
    }

    res.status(201).json({ message: serializeMessage(row) });
  },
});

module.exports = routes;
