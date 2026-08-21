const db = require('./db');
const { toPublicProfile } = require('./serialize');

const ICEBREAKERS = [
  'Geceyi uzatan tek şarkı hangisi?',
  'İlk konserin neydi?',
  'Şu an nereye ışınlanmak isterdin?',
];

function compatibility(a, b) {
  const aTags = new Set([...(a.musicTags || []), ...(a.vibeTags || [])]);
  const bTags = [...(b.musicTags || []), ...(b.vibeTags || [])];
  let shared = 0;
  for (const tag of bTags) if (aTags.has(tag)) shared++;
  const moodBonus = a.mood === b.mood ? 12 : 0;
  const base = 62;
  return Math.max(55, Math.min(99, base + shared * 7 + moodBonus));
}

function otherUserId(match, myId) {
  return match.userAId === myId ? match.userBId : match.userAId;
}

// Returns { match, isNew } - callers that need to push-notify the OTHER
// person about a fresh match (see routes/discovery.js) only want to do that
// when isNew is true, never when two people re-swipe an existing match.
function findOrCreateMatch(userA, userB, score) {
  const [a, b] = userA.id < userB.id ? [userA, userB] : [userB, userA];

  const existing = db.find(
    'matches',
    (m) => m.userAId === a.id && m.userBId === b.id
  );
  if (existing) return { match: existing, isNew: false };

  const question = ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)];
  const botUser = a.isBot ? a : b.isBot ? b : null;

  const match = db.insert('matches', {
    userAId: a.id,
    userBId: b.id,
    compatibility: score,
    icebreakerQuestion: question,
    icebreakerAnswerA: '',
    icebreakerAnswerB: botUser === b ? 'Kesinlikle. Sonra sahile ineriz.' : '',
    icebreakerAnswerAFromBot: botUser === a,
  });

  if (botUser) {
    db.insert('messages', {
      matchId: match.id,
      senderId: botUser.id,
      text: `Selam! Vibe Match %${score}. ${question}`,
      imageUrl: null,
    });
  }

  return { match, isNew: true };
}

function serializeMatch(match, myId) {
  const otherId = otherUserId(match, myId);
  const otherRow = db.findById('users', otherId);
  const matchMessages = db
    .filter('messages', (m) => m.matchId === match.id)
    .sort((x, y) => x.id - y.id);
  const lastMessage = matchMessages[matchMessages.length - 1] || null;

  const iAmA = match.userAId === myId;

  return {
    id: match.id,
    compatibility: match.compatibility,
    icebreaker: {
      question: match.icebreakerQuestion,
      answerMine: iAmA ? match.icebreakerAnswerA : match.icebreakerAnswerB,
      answerTheirs: iAmA ? match.icebreakerAnswerB : match.icebreakerAnswerA,
    },
    otherUser: toPublicProfile(otherRow),
    lastMessage: lastMessage
      ? {
          text: lastMessage.text,
          imageUrl: lastMessage.imageUrl,
          createdAt: lastMessage.createdAt,
          fromMe: lastMessage.senderId === myId,
        }
      : null,
    createdAt: match.createdAt,
  };
}

module.exports = { compatibility, otherUserId, findOrCreateMatch, serializeMatch };
