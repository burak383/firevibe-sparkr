// Zero-dependency JSON-file "database". Good enough for a demo/dev backend;
// swap for a real database (Postgres, SQLite via better-sqlite3, etc.) before
// shipping this to production.
require('./env');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '..', process.env.DB_PATH || './data/sparkr.json');
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const EMPTY_STATE = {
  nextIds: {
    users: 1,
    passwordResets: 1,
    swipes: 1,
    matches: 1,
    messages: 1,
    blocks: 1,
    reports: 1,
    profileViews: 1,
  },
  users: [],
  passwordResets: [],
  swipes: [],
  matches: [],
  messages: [],
  blocks: [],
  reports: [],
  // Who viewed whose profile - see routes/users.js's recordProfileView and
  // routes/discovery.js's GET /profile-views (the "Görüntüleyenler" tab).
  // One row per (viewerId, viewedUserId) pair, viewedAt bumped on repeat
  // views rather than inserting duplicates.
  profileViews: [],
};

function load() {
  if (!fs.existsSync(DB_PATH)) {
    return JSON.parse(JSON.stringify(EMPTY_STATE));
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    if (!raw.trim()) return JSON.parse(JSON.stringify(EMPTY_STATE));
    const parsed = JSON.parse(raw);
    // Backfill any keys added in later versions of the schema. This must be
    // more than a shallow spread for `nextIds`: if an existing data file
    // predates a new collection, `parsed.nextIds` fully overwrites
    // `EMPTY_STATE.nextIds` in a shallow merge, silently dropping that
    // collection's counter. insert() then does `undefined++` -> NaN ids,
    // and every later findById/update on that collection silently no-ops
    // (NaN !== NaN), which is a nasty bug to chase.
    const merged = { ...JSON.parse(JSON.stringify(EMPTY_STATE)), ...parsed };
    merged.nextIds = { ...EMPTY_STATE.nextIds, ...(parsed.nextIds || {}) };
    return merged;
  } catch (err) {
    console.error('[db] Failed to read database file, starting fresh:', err.message);
    return JSON.parse(JSON.stringify(EMPTY_STATE));
  }
}

const state = load();

let saveScheduled = false;
function persist() {
  if (saveScheduled) return;
  saveScheduled = true;
  setImmediate(() => {
    saveScheduled = false;
    fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2));
    maybeRotateBackup();
  });
}

// HONEST LIMITATION: this only protects against a bad write corrupting
// sparkr.json itself (a bug, a crash mid-write) - it copies onto the SAME
// disk, so it does nothing if the whole disk is lost/deleted. Real
// off-server backups (to a bucket, another machine, etc.) need separate
// setup this project doesn't have; see /admin (routes/admin.js) for a
// manual "download the current database" button in the meantime.
const BACKUP_DIR = path.join(dir, 'backups');
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h at most, not every write
const MAX_BACKUPS = 8; // 8 * 6h = 2 days of rolling history
let lastBackupAt = 0;

function maybeRotateBackup() {
  const now = Date.now();
  if (now - lastBackupAt < BACKUP_INTERVAL_MS) return;
  lastBackupAt = now;
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, `sparkr-${stamp}.json`));
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('sparkr-') && f.endsWith('.json'))
      .sort();
    for (const old of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) {
      fs.unlinkSync(path.join(BACKUP_DIR, old));
    }
  } catch (err) {
    // A failed backup should never take the app down - just log it.
    console.error('[db] Backup rotation failed:', err.message);
  }
}

function nextId(collection) {
  // Self-heal if a collection's counter is missing/NaN (e.g. a fresh
  // collection added after old data was already on disk) instead of handing
  // out NaN ids that break every future findById/update on that row.
  const current = Number.isFinite(state.nextIds[collection]) ? state.nextIds[collection] : 1;
  state.nextIds[collection] = current + 1;
  persist();
  return current;
}

function insert(collection, record) {
  const id = nextId(collection);
  const row = { id, ...record, createdAt: new Date().toISOString() };
  state[collection].push(row);
  persist();
  return row;
}

function all(collection) {
  return state[collection];
}

function findById(collection, id) {
  return state[collection].find((row) => row.id === Number(id));
}

function find(collection, predicate) {
  return state[collection].find(predicate);
}

function filter(collection, predicate) {
  return state[collection].filter(predicate);
}

function update(collection, id, patch) {
  const row = findById(collection, id);
  if (!row) return null;
  Object.assign(row, patch);
  persist();
  return row;
}

function remove(collection, id) {
  const idx = state[collection].findIndex((row) => row.id === Number(id));
  if (idx === -1) return false;
  state[collection].splice(idx, 1);
  persist();
  return true;
}

function removeWhere(collection, predicate) {
  const before = state[collection].length;
  state[collection] = state[collection].filter((row) => !predicate(row));
  if (state[collection].length !== before) persist();
  return before - state[collection].length;
}

module.exports = { insert, all, findById, find, filter, update, remove, removeWhere, persist, DB_PATH };
