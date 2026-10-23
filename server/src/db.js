import pg from 'pg';

const { Pool } = pg;

// Connection via DATABASE_URL (same code locally and in production).
// Example local: postgres://kamal:devpass@localhost:5432/kamaltrack
const connectionString =
  process.env.DATABASE_URL || 'postgres://kamal:devpass@localhost:5432/kamaltrack';

// Managed Postgres (Render etc.) requires SSL; local does not.
const useSSL = /render\.com|amazonaws\.com|sslmode=require/.test(connectionString) ||
  process.env.PGSSL === 'true';

export const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

// Small query helper. Usage: const { rows } = await query('SELECT ...', [params]).
export function query(text, params) {
  return pool.query(text, params);
}

// Idempotent schema creation. Safe to run on every boot.
export async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT,                      -- null allowed for future OAuth-only accounts
      name          TEXT NOT NULL DEFAULT '',
      provider      TEXT NOT NULL DEFAULT 'local', -- 'local' | future: 'google'
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Password reset tokens (mechanism only; emailing the token is a separate seam).
    CREATE TABLE IF NOT EXISTS password_resets (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS areas (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#6366f1',
      icon       TEXT NOT NULL DEFAULT '📁',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS trackers (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      area_id       INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      unit          TEXT NOT NULL DEFAULT '',
      type          TEXT NOT NULL DEFAULT 'number',
      schedule_freq TEXT NOT NULL DEFAULT 'weekly',
      schedule_dow  INTEGER,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS entries (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tracker_id INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
      value      DOUBLE PRECISION NOT NULL,
      note       TEXT NOT NULL DEFAULT '',
      date       DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS items (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      area_id          INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
      tracker_id       INTEGER REFERENCES trackers(id) ON DELETE CASCADE,
      type             TEXT NOT NULL DEFAULT 'goal',
      content          TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'open',
      target_value     DOUBLE PRECISION,
      target_direction TEXT NOT NULL DEFAULT 'at_least',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS habits (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#6366f1',
      is_core    BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived   BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS habit_logs (
      id        SERIAL PRIMARY KEY,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      habit_id  INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      date      DATE NOT NULL,
      value     INTEGER NOT NULL,
      UNIQUE(habit_id, date)
    );

    CREATE TABLE IF NOT EXISTS events (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      date       DATE NOT NULL,
      start_time TEXT,
      end_time   TEXT,
      color      TEXT NOT NULL DEFAULT '#6366f1',
      notes      TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_areas_user ON areas(user_id);
    CREATE INDEX IF NOT EXISTS idx_trackers_user ON trackers(user_id);
    CREATE INDEX IF NOT EXISTS idx_trackers_area ON trackers(area_id);
    CREATE INDEX IF NOT EXISTS idx_entries_user ON entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_entries_tracker ON entries(tracker_id);
    CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
    CREATE INDEX IF NOT EXISTS idx_items_area ON items(area_id);
    CREATE INDEX IF NOT EXISTS idx_items_tracker ON items(tracker_id);
    CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
    CREATE INDEX IF NOT EXISTS idx_habit_logs_user ON habit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date);
    CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
    CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
  `);
}
