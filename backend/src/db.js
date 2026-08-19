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
  nextIds: { users: 1, passwordResets: 1, smsCodes: 1, swipes: 1, matches: 1, messages: 1, blocks: 1, reports: 1 },
  users: [],
  passwordResets: [],
  smsCodes: [],
  swipes: [],
  matches: [],
  messages: [],
  blocks: [],
  reports: [],
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
  });
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

module.exports = { insert, all, findById, find, filter, update, remove, removeWhere, persist };
