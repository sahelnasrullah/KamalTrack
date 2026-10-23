import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'kamaltrack.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS areas (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    color     TEXT NOT NULL DEFAULT '#6366f1',
    icon      TEXT NOT NULL DEFAULT '📁',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trackers (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    area_id   INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    unit      TEXT NOT NULL DEFAULT '',
    type      TEXT NOT NULL DEFAULT 'number',   -- number | scale | boolean
    schedule_freq TEXT NOT NULL DEFAULT 'weekly', -- daily | weekly | none
    schedule_dow  INTEGER,                        -- 0=Sun..6=Sat, for weekly
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tracker_id INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
    value      REAL NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    date       TEXT NOT NULL DEFAULT (date('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    area_id    INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    tracker_id INTEGER REFERENCES trackers(id) ON DELETE CASCADE, -- optional: item scoped to a tracker
    type       TEXT NOT NULL DEFAULT 'goal',   -- goal | task | note
    content    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'open',   -- open | done
    target_value     REAL,                      -- goal only: numeric target
    target_direction TEXT NOT NULL DEFAULT 'at_least', -- at_least | at_most
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_trackers_area ON trackers(area_id);
  CREATE INDEX IF NOT EXISTS idx_entries_tracker ON entries(tracker_id);
  CREATE INDEX IF NOT EXISTS idx_items_area ON items(area_id);
`);

// --- lightweight migrations for pre-existing databases ---------------------
// CREATE TABLE IF NOT EXISTS won't alter an existing items table, so add any
// missing columns here. Safe to run on every boot.
const itemCols = db.prepare(`PRAGMA table_info(items)`).all().map((c) => c.name);
if (!itemCols.includes('tracker_id')) {
  db.exec(`ALTER TABLE items ADD COLUMN tracker_id INTEGER REFERENCES trackers(id) ON DELETE CASCADE`);
}
if (!itemCols.includes('target_value')) {
  db.exec(`ALTER TABLE items ADD COLUMN target_value REAL`);
}
if (!itemCols.includes('target_direction')) {
  db.exec(`ALTER TABLE items ADD COLUMN target_direction TEXT NOT NULL DEFAULT 'at_least'`);
}

// Index on tracker_id must come after the column exists (migration above).
db.exec(`CREATE INDEX IF NOT EXISTS idx_items_tracker ON items(tracker_id)`);

export default db;
