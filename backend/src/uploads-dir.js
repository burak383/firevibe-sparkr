const fs = require('fs');
const path = require('path');

// Same pattern as DB_PATH in db.js: override via env so this can point at a
// persistent disk mount in production (e.g. Render's disk at /data/uploads)
// instead of the container's ephemeral filesystem, which gets wiped on every
// redeploy/restart. path.resolve() with an absolute UPLOAD_DIR value ignores
// __dirname entirely, so this is a no-op change for local dev.
const UPLOAD_DIR = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || './data/uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

module.exports = { UPLOAD_DIR };
