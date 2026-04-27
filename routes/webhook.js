const crypto = require('crypto');
const express = require('express');
const { pool } = require('../db');
const { replyToComment, sendDm } = require('../instagram');

const router = express.Router();
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || '';
const APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';

function verifySignature(rawBody, header) {
  if (!APP_SECRET) {
    console.warn('FACEBOOK_APP_SECRET not set — skipping signature check');
    return true;
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(header || '', 'utf8'));
  } catch {
    return false;
  }
}

router.get('/webhook/instagram', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.send(challenge);
  res.sendStatus(403);
});

router.post(
  '/webhook/instagram',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!verifySignature(req.body, req.headers['x-hub-signature-256'])) {
      return res.sendStatus(403);
    }
    let payload;
    try { payload = JSON.parse(req.body); } catch { return res.sendStatus(400); }

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === 'comments') {
          await handleComment(change.value).catch(err =>
            console.error('handleComment error:', err.message)
          );
        }
      }
    }
    res.json({ status: 'ok' });
  }
);

async function handleComment(value) {
  const commentId = value.id;
  const postId = value.media?.id || value.post_id;
  const commenterId = value.from?.id;
  const text = value.text || '';
  if (!commentId || !postId || !commenterId) return;

  const { rows: existing } = await pool.query(
    'SELECT 1 FROM processed_comments WHERE comment_id = $1', [commentId]
  );
  if (existing.length) return;

  const { rows: campaigns } = await pool.query(
    'SELECT * FROM campaigns WHERE post_id = $1 AND active = true', [postId]
  );

  const matched = campaigns.find(c =>
    c.keywords.split(',').map(k => k.trim().toLowerCase()).some(kw => text.toLowerCase().includes(kw))
  );
  if (!matched) return;

  console.log(`Matched campaign ${matched.id} for comment ${commentId}`);
  await pool.query(
    'INSERT INTO processed_comments (comment_id, campaign_id) VALUES ($1, $2)',
    [commentId, matched.id]
  );

  await replyToComment(commentId, matched.comment_reply).catch(err =>
    console.error('Reply error:', err.message)
  );
  await sendDm(commenterId, matched.dm_message).catch(err =>
    console.error('DM error:', err.message)
  );
}

module.exports = router;
