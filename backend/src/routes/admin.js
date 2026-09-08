// Minimal trust & safety admin surface - see /admin (server.js serves the
// static dashboard HTML) and admin-auth.js for the HTTP Basic Auth gate.
// Deliberately small in scope: review reports (dismiss or ban the reported
// user), review pending selfie verifications (approve/reject - see
// routes/users.js's POST /verify-selfie, which now only queues a photo
// instead of instantly approving it), and download a copy of the live
// database. Not a general user-management panel.
const db = require('../db');
const { requireAdmin } = require('../admin-auth');
const { toPublicUser } = require('../serialize');

const routes = [];

function summarizeUser(id) {
  const row = db.findById('users', id);
  if (!row) return { id, name: '(silinmiş kullanıcı)', avatarUrl: '', deleted: true };
  return { id: row.id, name: row.name, avatarUrl: row.avatarUrl || '', banned: !!row.banned };
}

routes.push({
  method: 'GET',
  path: '/admin/api/reports',
  handler: async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const reports = db
      .all('reports')
      .slice()
      .sort((a, b) => b.id - a.id)
      .map((r) => ({
        id: r.id,
        reason: r.reason,
        createdAt: r.createdAt,
        reporter: summarizeUser(r.reporterId),
        reported: summarizeUser(r.reportedUserId),
      }));
    res.json({ reports });
  },
});

routes.push({
  method: 'POST',
  path: '/admin/api/reports/:id/dismiss',
  handler: async (req, res, params) => {
    if (!requireAdmin(req, res)) return;
    const removed = db.remove('reports', Number(params.id));
    res.json({ ok: removed });
  },
});

routes.push({
  method: 'POST',
  path: '/admin/api/reports/:id/ban',
  handler: async (req, res, params) => {
    if (!requireAdmin(req, res)) return;
    const report = db.findById('reports', Number(params.id));
    if (!report) return res.status(404).json({ error: 'Şikayet bulunamadı' });
    db.update('users', report.reportedUserId, { banned: true, bannedAt: new Date().toISOString() });
    db.remove('reports', report.id);
    console.log(`[admin] Banned user #${report.reportedUserId} from report #${report.id}`);
    res.json({ ok: true });
  },
});

routes.push({
  method: 'GET',
  path: '/admin/api/users/banned',
  handler: async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const banned = db
      .filter('users', (u) => !!u.banned)
      .map((u) => ({ id: u.id, name: u.name, contact: u.contact, bannedAt: u.bannedAt || null }));
    res.json({ banned });
  },
});

routes.push({
  method: 'POST',
  path: '/admin/api/users/:id/unban',
  handler: async (req, res, params) => {
    if (!requireAdmin(req, res)) return;
    const row = db.update('users', Number(params.id), { banned: false });
    if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ ok: true });
  },
});

routes.push({
  method: 'GET',
  path: '/admin/api/verifications',
  handler: async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const pending = db
      .filter('users', (u) => u.verificationStatus === 'pending')
      .sort((a, b) => new Date(a.pendingSelfieSubmittedAt || 0) - new Date(b.pendingSelfieSubmittedAt || 0))
      .map((u) => ({
        id: u.id,
        name: u.name,
        age: u.age,
        avatarUrl: u.avatarUrl || '',
        pendingSelfieUrl: u.pendingSelfieUrl || '',
        submittedAt: u.pendingSelfieSubmittedAt || null,
      }));
    res.json({ pending });
  },
});

routes.push({
  method: 'POST',
  path: '/admin/api/verifications/:id/approve',
  handler: async (req, res, params) => {
    if (!requireAdmin(req, res)) return;
    const row = db.update('users', Number(params.id), {
      verified: true,
      verifiedAt: new Date().toISOString(),
      verificationStatus: 'none',
      pendingSelfieUrl: null,
    });
    if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ user: toPublicUser(row) });
  },
});

routes.push({
  method: 'POST',
  path: '/admin/api/verifications/:id/reject',
  handler: async (req, res, params) => {
    if (!requireAdmin(req, res)) return;
    // Left able to resubmit - not banned, not `verified`, just back to
    // having no pending selfie. SelfieDogrulama.tsx shows the rejection and
    // lets them try again (e.g. bad lighting, not actually a live photo).
    const row = db.update('users', Number(params.id), {
      verificationStatus: 'rejected',
      pendingSelfieUrl: null,
    });
    if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ user: toPublicUser(row) });
  },
});

module.exports = { routes };
