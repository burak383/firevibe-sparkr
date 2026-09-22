const db = require('./db');
const { toPublicProfile } = require('./serialize');
const { isFireHourLive } = require('./fireHour');

const ICEBREAKERS = [
  'Geceyi uzatan tek şarkı hangisi?',
  'İlk konserin neydi?',
  'Şu an nereye ışınlanmak isterdin?',
];

// Differentiator #1 (vs. swipe-and-chat-forever apps): a match struck
// DURING Fire Hour is time-boxed. If neither real person ever sends a
// message within this window, it quietly expires instead of sitting there
// forever - see pruneIfExpired() below. Regular (non-Fire-Hour) matches
// never expire.
const FIRE_HOUR_MATCH_TTL_MS = 24 * 60 * 60 * 1000;

// Differentiator #2: a few days after a match that actually talked, ask
// "did you two meet?" - see recordMetFeedback()/serializeMatch() below.
// Deliberately excludes bot matches (see isBotMatch) - "did you meet" makes
// no sense for a match against a seed bot.
const MET_PROMPT_DELAY_MS = 3 * 24 * 60 * 60 * 1000;

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

// Looked up live from the user rows (rather than cached on the match row)
// so it stays correct even for matches created before this field existed -
// no data migration needed for older rows in an existing sparkr.json.
function getMatchBotId(match) {
  const a = db.findById('users', match.userAId);
  const b = db.findById('users', match.userBId);
  if (a && a.isBot) return a.id;
  if (b && b.isBot) return b.id;
  return null;
}

// Has either REAL person in this match sent anything? A bot's own
// auto-greeting (inserted at match creation, see findOrCreateMatch below)
// never counts - only counts as "answered" once a human actually engages.
function hasHumanReply(matchId, botId) {
  return db.filter('messages', (m) => m.matchId === matchId && m.senderId !== botId).length > 0;
}

// Fire-Hour matches are time-boxed (see FIRE_HOUR_MATCH_TTL_MS) - if the
// window passed with no human reply, this deletes the match + its messages
// (same cleanup as an explicit unmatch) and returns true. Called lazily
// from loadMyMatch()/the matches list below, on every read, rather than a
// background job - this backend has no scheduler, and a real 24h setTimeout
// wouldn't survive a redeploy/restart anyway (same class of problem as the
// DB_PATH persistence issue - see backend/src/db.js).
function pruneIfExpired(match) {
  if (!match.expiresAt) return false;
  if (Date.now() < new Date(match.expiresAt).getTime()) return false;
  if (hasHumanReply(match.id, getMatchBotId(match))) return false;
  db.removeWhere('messages', (m) => m.matchId === match.id);
  db.remove('matches', match.id);
  return true;
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

  const fireHourMatch = isFireHourLive();

  const match = db.insert('matches', {
    userAId: a.id,
    userBId: b.id,
    compatibility: score,
    icebreakerQuestion: question,
    icebreakerAnswerA: '',
    icebreakerAnswerB: botUser === b ? 'Kesinlikle. Sonra sahile ineriz.' : '',
    icebreakerAnswerAFromBot: botUser === a,
    fireHourMatch,
    expiresAt: fireHourMatch ? new Date(Date.now() + FIRE_HOUR_MATCH_TTL_MS).toISOString() : null,
    metFeedbackA: null,
    metFeedbackB: null,
  });

  if (botUser) {
    db.insert('messages', {
      matchId: match.id,
      senderId: botUser.id,
      text: `Selam! Vibe Match %${score}. ${question}`,
      imageUrl: null,
      audioUrl: null,
    });
  }

  return { match, isNew: true };
}

// Records MY OWN "did we meet?" answer on the match (userA/userB slots,
// same pattern as icebreakerAnswerA/B above) - the other person's answer,
// if any, lives in the other slot and doesn't affect my own showMetPrompt.
function recordMetFeedback(match, myId, met) {
  const field = match.userAId === myId ? 'metFeedbackA' : 'metFeedbackB';
  db.update('matches', match.id, { [field]: met ? 'yes' : 'no' });
}

function serializeMatch(match, myId) {
  const otherId = otherUserId(match, myId);
  const otherRow = db.findById('users', otherId);
  const me = db.findById('users', myId);
  const matchMessages = db
    .filter('messages', (m) => m.matchId === match.id)
    .sort((x, y) => x.id - y.id);
  const lastMessage = matchMessages[matchMessages.length - 1] || null;

  const iAmA = match.userAId === myId;
  const myMetAnswer = (iAmA ? match.metFeedbackA : match.metFeedbackB) || null;

  // Eligible once: it's been a few days, at least one real message exists
  // (no point asking about a match nobody ever opened), and it isn't a bot
  // match (asking "did you meet?" about a seed bot makes no sense).
  const metPromptEligible =
    !getMatchBotId(match) &&
    matchMessages.length > 0 &&
    Date.now() >= new Date(match.createdAt).getTime() + MET_PROMPT_DELAY_MS;

  return {
    id: match.id,
    compatibility: match.compatibility,
    icebreaker: {
      question: match.icebreakerQuestion,
      answerMine: iAmA ? match.icebreakerAnswerA : match.icebreakerAnswerB,
      answerTheirs: iAmA ? match.icebreakerAnswerB : match.icebreakerAnswerA,
    },
    otherUser: toPublicProfile(otherRow, me),
    lastMessage: lastMessage
      ? {
          text: lastMessage.text,
          imageUrl: lastMessage.imageUrl,
          audioUrl: lastMessage.audioUrl,
          createdAt: lastMessage.createdAt,
          fromMe: lastMessage.senderId === myId,
        }
      : null,
    createdAt: match.createdAt,
    // Fire Hour expiring-match mechanic - see FIRE_HOUR_MATCH_TTL_MS above.
    // `expiresAt` is null for a regular (non-Fire-Hour) match, which never
    // expires. Once a human replies, hasHumanReply() keeps pruneIfExpired()
    // from ever removing it, even past expiresAt - the mobile app can still
    // show the original countdown text if it wants, but it's no longer
    // actually enforced server-side once someone engaged.
    fireHourMatch: !!match.fireHourMatch,
    expiresAt: match.expiresAt || null,
    // "Did you meet?" feedback prompt - see MET_PROMPT_DELAY_MS above.
    showMetPrompt: metPromptEligible && !myMetAnswer,
    metAnswer: myMetAnswer,
  };
}

module.exports = {
  compatibility,
  otherUserId,
  findOrCreateMatch,
  serializeMatch,
  pruneIfExpired,
  recordMetFeedback,
};
