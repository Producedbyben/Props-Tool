const Database = require('better-sqlite3');
const { dbPath } = require('./config');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      notes TEXT,
      treatment_doc_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS props (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      prop_name TEXT NOT NULL,
      description TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      priority TEXT NOT NULL CHECK (priority IN ('must-have','nice-to-have')) DEFAULT 'must-have',
      scene_or_reference TEXT,
      treatment_doc_url TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      search_query_override TEXT,
      status TEXT NOT NULL DEFAULT 'not_searched',
      selected_option_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS prop_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      prop_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      asin TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      image_url TEXT,
      price_amount REAL NOT NULL,
      price_currency TEXT NOT NULL DEFAULT 'GBP',
      prime_eligible INTEGER NOT NULL,
      delivery_expected_date_iso TEXT,
      delivery_message TEXT,
      rating_stars REAL,
      rating_count INTEGER,
      sold_by TEXT,
      fulfilled_by_amazon INTEGER,
      raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (prop_id) REFERENCES props(id)
    );

    CREATE TABLE IF NOT EXISTS provider_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      prop_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      query_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      response_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      type TEXT NOT NULL,
      project_id INTEGER,
      prop_id INTEGER,
      asin TEXT,
      success INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      credits_used REAL,
      error_code TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { db, initDb };
