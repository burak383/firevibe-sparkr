const db = require('./db');
const { hashPassword } = require('./auth');

const BOT_PASSWORD_HASH = hashPassword('firevibe-bot-not-a-real-login');

const BOTS = [
  {
    name: 'Deniz',
    contact: 'deniz@firevibe.app',
    age: 28,
    bio: "Beyoğlu'nda gecenin iyi tarafını arıyor.",
    city: 'İstanbul',
    neighbourhood: 'Beyoğlu',
    avatarUrl:
      'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/9487435d-a1a9-409e-9039-345c4c617c5c.png',
    gallery: [
      'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/b53d5af3-c38e-4374-a09b-ec26dabcf986.png',
    ],
    musicTags: ['Vinyl Avcısı', 'Techno', 'Alt Pop'],
    vibeTags: ['Vinyl Avcısı', 'Gece Sürüşü', 'Beyoğlu'],
    mood: 'Party',
    favoriteTrack: 'M83 — Midnight City',
    distanceKm: 2.4,
  },
  {
    name: 'Ece',
    contact: 'ece@firevibe.app',
    age: 28,
    bio: 'Cihangir’de geceye karışan bir plak avcısı.',
    city: 'İstanbul',
    neighbourhood: 'Cihangir',
    avatarUrl:
      'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/8b26a8cc-916f-4b91-8de3-784f050e721e.png',
    gallery: [
      'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/3f1c42ec-c161-4d50-96e9-fd35eb4bd6b1.png',
    ],
    musicTags: ['Alt Pop', 'Techno', 'Indie Rock'],
    vibeTags: ['Gece Yürüyüşü', 'Canlı Müzik', 'Spontane Plan'],
    mood: 'Deep Talk',
    favoriteTrack: 'Gaye Su Akyol — İstikrarlı Hayal Hakikattir',
    distanceKm: 3.1,
  },
  {
    name: 'Arda',
    contact: 'arda@firevibe.app',
    age: 26,
    bio: 'Kadıköy sahilinde gitarla gün doğumu bekleyen biri.',
    city: 'İstanbul',
    neighbourhood: 'Kadıköy',
    avatarUrl:
      'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/dfdd4817-2d73-4cb2-9d85-718f44f21375.png',
    gallery: [],
    musicTags: ['Indie Rock', 'R&B'],
    vibeTags: ['Canlı Müzik', 'Gece Yürüyüşü'],
    mood: 'Adrenaline',
    favoriteTrack: 'Duman — Belki Alışman Lazım',
    distanceKm: 4.8,
  },
  {
    name: 'Mert',
    contact: 'mert@firevibe.app',
    age: 27,
    bio: 'Kadıköy’de iyi bir bas çizgisi arıyorum.',
    city: 'İstanbul',
    neighbourhood: 'Kadıköy',
    avatarUrl:
      'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/ae749811-2951-4d33-ac06-0148afbe8e5c.png',
    gallery: [],
    musicTags: ['Alt Pop', 'Techno'],
    vibeTags: ['Gece Yürüyüşü', 'Canlı Müzik', 'Spontane Plan'],
    mood: 'Deep Talk',
    favoriteTrack: 'Midnight City',
    distanceKm: 1.6,
  },
  {
    name: 'Zeynep',
    contact: 'zeynep@firevibe.app',
    age: 25,
    bio: 'Moda sahilinde deniz fenerini takip eden bir gezgin.',
    city: 'İstanbul',
    neighbourhood: 'Moda',
    avatarUrl:
      'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/4d1de130-8289-4ff2-9e90-040da84c9a03.png',
    gallery: [],
    musicTags: ['R&B', 'Indie Rock'],
    vibeTags: ['Spontane Plan', 'Deep Talk'],
    mood: 'Chill',
    favoriteTrack: 'Sezen Aksu — Firuze',
    distanceKm: 5.3,
  },
];

function ensureSeeded() {
  if (db.all('users').length > 0) return;

  for (const bot of BOTS) {
    db.insert('users', {
      name: bot.name,
      contact: bot.contact,
      passwordHash: BOT_PASSWORD_HASH,
      birthDate: null,
      age: bot.age,
      bio: bot.bio,
      city: bot.city,
      neighbourhood: bot.neighbourhood,
      avatarUrl: bot.avatarUrl,
      gallery: bot.gallery,
      musicTags: bot.musicTags,
      vibeTags: bot.vibeTags,
      mood: bot.mood,
      ageRangeMin: 22,
      ageRangeMax: 35,
      discoveryRadiusKm: 12,
      voiceNoteUrl: '',
      verified: true,
      isBot: true,
      onboardingComplete: true,
      phoneVerified: true,
      distanceKm: bot.distanceKm,
      favoriteTrack: bot.favoriteTrack,
    });
  }

  console.log(`[seed] created ${BOTS.length} demo profiles (Deniz, Ece, Arda, Mert, Zeynep)`);
}

module.exports = { ensureSeeded };
