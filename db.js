// Uses Node.js built-in sqlite (Node 22.5+) — no npm package or compilation needed.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

function getDbPath() {
  if (process.env.VERCEL) return '/tmp/app.db';
  return process.env.DATABASE_URL || path.join(__dirname, 'app.db');
}

let _db;

function getDb() {
  if (_db) return _db;
  _db = new DatabaseSync(getDbPath());
  _initSchema(_db);
  return _db;
}

function _initSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      access_token TEXT,
      page_id TEXT,
      instagram_account_id TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      post_id TEXT NOT NULL,
      post_preview_url TEXT,
      post_caption TEXT,
      keywords TEXT NOT NULL,
      comment_reply TEXT NOT NULL,
      dm_message TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS processed_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id TEXT UNIQUE NOT NULL,
      campaign_id INTEGER,
      processed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_comment_id ON processed_comments(comment_id);
  `);
}

module.exports = { getDb };
