const express = require('express');
const { pool } = require('../db');
const { getPostDetails } = require('../instagram');

const router = express.Router();
router.use(express.json());

function row2campaign(row) {
  return { ...row, active: Boolean(row.active) };
}

// ── Config ────────────────────────────────────────────────────────────────────

router.get('/api/config', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM config WHERE id = 1');
  const cfg = rows[0] || {};
  res.json({
    access_token: cfg.access_token || '',
    page_id: cfg.page_id || '',
    instagram_account_id: cfg.instagram_account_id || '',
    updated_at: cfg.updated_at || null,
  });
});

router.post('/api/config', async (req, res) => {
  const { access_token, page_id, instagram_account_id } = req.body;
  const { rows } = await pool.query(`
    INSERT INTO config (id, access_token, page_id, instagram_account_id, updated_at)
    VALUES (1, $1, $2, $3, NOW())
    ON CONFLICT (id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      page_id = EXCLUDED.page_id,
      instagram_account_id = EXCLUDED.instagram_account_id,
      updated_at = NOW()
    RETURNING *
  `, [access_token, page_id, instagram_account_id]);
  res.json(rows[0]);
});

// ── Campaigns ─────────────────────────────────────────────────────────────────

router.get('/api/campaigns', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM campaigns ORDER BY created_at DESC');
  res.json(rows.map(row2campaign));
});

router.post('/api/campaigns', async (req, res) => {
  const { name, post_id, keywords, comment_reply, dm_message, active } = req.body;
  const details = await getPostDetails(post_id).catch(() => ({}));
  const { rows } = await pool.query(`
    INSERT INTO campaigns
      (name, post_id, post_preview_url, post_caption, keywords, comment_reply, dm_message, active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [name, post_id, details.preview_url || null, details.caption || null,
      keywords, comment_reply, dm_message, active]);
  res.json(row2campaign(rows[0]));
});

router.get('/api/campaigns/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ detail: 'Campaign not found' });
  res.json(row2campaign(rows[0]));
});

router.put('/api/campaigns/:id', async (req, res) => {
  const { rows: cur } = await pool.query('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  if (!cur[0]) return res.status(404).json({ detail: 'Campaign not found' });

  const { name, post_id, keywords, comment_reply, dm_message, active } = req.body;
  let preview_url = cur[0].post_preview_url;
  let caption = cur[0].post_caption;

  if (post_id !== cur[0].post_id) {
    const details = await getPostDetails(post_id).catch(() => ({}));
    preview_url = details.preview_url || null;
    caption = details.caption || null;
  }

  const { rows } = await pool.query(`
    UPDATE campaigns
    SET name=$1, post_id=$2, post_preview_url=$3, post_caption=$4,
        keywords=$5, comment_reply=$6, dm_message=$7, active=$8, updated_at=NOW()
    WHERE id=$9
    RETURNING *
  `, [name, post_id, preview_url, caption, keywords, comment_reply, dm_message, active, req.params.id]);
  res.json(row2campaign(rows[0]));
});

router.patch('/api/campaigns/:id/toggle', async (req, res) => {
  const { rows: cur } = await pool.query('SELECT active FROM campaigns WHERE id = $1', [req.params.id]);
  if (!cur[0]) return res.status(404).json({ detail: 'Campaign not found' });
  const { rows } = await pool.query(
    'UPDATE campaigns SET active=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
    [!cur[0].active, req.params.id]
  );
  res.json(row2campaign(rows[0]));
});

router.delete('/api/campaigns/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM campaigns WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ detail: 'Not found' });
  res.json({ status: 'deleted' });
});

// ── Post preview ──────────────────────────────────────────────────────────────

router.get('/api/post-preview/:postId', async (req, res) => {
  const details = await getPostDetails(req.params.postId);
  if (!details.id) return res.status(404).json({ detail: 'Post not found or access token invalid' });
  res.json(details);
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get('/api/stats', async (req, res) => {
  const [total, active, processed] = await Promise.all([
    pool.query('SELECT COUNT(*) AS n FROM campaigns'),
    pool.query('SELECT COUNT(*) AS n FROM campaigns WHERE active = true'),
    pool.query('SELECT COUNT(*) AS n FROM processed_comments'),
  ]);
  res.json({
    total_campaigns: parseInt(total.rows[0].n),
    active_campaigns: parseInt(active.rows[0].n),
    processed_comments: parseInt(processed.rows[0].n),
  });
});

module.exports = router;
