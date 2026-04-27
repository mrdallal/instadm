const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let _initPromise = null;

async function initDb() {
  if (_initPromise) return _initPromise;
  _initPromise = pool.query(`
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      access_token TEXT,
      page_id TEXT,
      instagram_account_id TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      post_id TEXT NOT NULL,
      post_preview_url TEXT,
      post_caption TEXT,
      keywords TEXT NOT NULL,
      comment_reply TEXT NOT NULL,
      dm_message TEXT NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS processed_comments (
      id SERIAL PRIMARY KEY,
      comment_id TEXT UNIQUE NOT NULL,
      campaign_id INTEGER,
      processed_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_comment_id ON processed_comments(comment_id);
  `);
  return _initPromise;
}

module.exports = { pool, initDb };
