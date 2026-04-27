const express = require('express');
const { getDb } = require('../db');
const { getPostDetails } = require('../instagram');

const router = express.Router();
router.use(express.json());

function row2campaign(row) {
  return { ...row, active: Boolean(row.active) };
}

// ── Config ────────────────────────────────────────────────────────────────────

router.get('/api/config', (req, res) => {
  const cfg = getDb().prepare('SELECT * FROM config WHERE id = 1').get() || {};
  res.json({
    access_token: cfg.access_token || '',
    page_id: cfg.page_id || '',
    instagram_account_id: cfg.instagram_account_id || '',
    updated_at: cfg.updated_at || null,
  });
});

router.post('/api/config', (req, res) => {
  const { access_token, page_id, instagram_account_id } = req.body;
  const db = getDb();
  db.prepare(`
    INSERT INTO config (id, access_token, page_id, instagram_account_id, updated_at)
    VALUES (1, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      page_id = excluded.page_id,
      instagram_account_id = excluded.instagram_account_id,
      updated_at = excluded.updated_at
  `).run(access_token, page_id, instagram_account_id);
  res.json(db.prepare('SELECT * FROM config WHERE id = 1').get());
});

// ── Campaigns ─────────────────────────────────────────────────────────────────

router.get('/api/campaigns', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
  res.json(rows.map(row2campaign));
});

router.post('/api/campaigns', async (req, res) => {
  const { name, post_id, keywords, comment_reply, dm_message, active } = req.body;
  const details = await getPostDetails(post_id).catch(() => ({}));
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO campaigns (name, post_id, post_preview_url, post_caption, keywords, comment_reply, dm_message, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, post_id, details.preview_url || null, details.caption || null, keywords, comment_reply, dm_message, active ? 1 : 0);
  res.json(row2campaign(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(info.lastInsertRowid)));
});

router.get('/api/campaigns/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ detail: 'Campaign not found' });
  res.json(row2campaign(row));
});

router.put('/api/campaigns/:id', async (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ detail: 'Campaign not found' });

  const { name, post_id, keywords, comment_reply, dm_message, active } = req.body;
  let { post_preview_url: preview_url, post_caption: caption } = existing;

  if (post_id !== existing.post_id) {
    const details = await getPostDetails(post_id).catch(() => ({}));
    preview_url = details.preview_url || null;
    caption = details.caption || null;
  }

  db.prepare(`
    UPDATE campaigns SET name=?, post_id=?, post_preview_url=?, post_caption=?,
    keywords=?, comment_reply=?, dm_message=?, active=?, updated_at=datetime('now')
    WHERE id=?
  `).run(name, post_id, preview_url, caption, keywords, comment_reply, dm_message, active ? 1 : 0, req.params.id);

  res.json(row2campaign(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id)));
});

router.patch('/api/campaigns/:id/toggle', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ detail: 'Campaign not found' });
  db.prepare("UPDATE campaigns SET active=?, updated_at=datetime('now') WHERE id=?").run(row.active ? 0 : 1, req.params.id);
  res.json(row2campaign(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id)));
});

router.delete('/api/campaigns/:id', (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(req.params.id)) {
    return res.status(404).json({ detail: 'Not found' });
  }
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(req.params.id);
  res.json({ status: 'deleted' });
});

// ── Post preview ──────────────────────────────────────────────────────────────

router.get('/api/post-preview/:postId', async (req, res) => {
  const details = await getPostDetails(req.params.postId);
  if (!details.id) return res.status(404).json({ detail: 'Post not found or access token invalid' });
  res.json(details);
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get('/api/stats', (req, res) => {
  const db = getDb();
  res.json({
    total_campaigns: db.prepare('SELECT COUNT(*) AS n FROM campaigns').get().n,
    active_campaigns: db.prepare('SELECT COUNT(*) AS n FROM campaigns WHERE active = 1').get().n,
    processed_comments: db.prepare('SELECT COUNT(*) AS n FROM processed_comments').get().n,
  });
});

module.exports = router;
