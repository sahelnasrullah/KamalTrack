import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import db from './db.js';
import { getAIProvider } from './ai/index.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// --- helpers ---------------------------------------------------------------

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// wrap async route handlers so thrown errors hit the error middleware
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- health ----------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ ok: true, provider: (process.env.AI_PROVIDER || 'mock') });
});

// --- areas -----------------------------------------------------------------

app.get('/api/areas', (req, res) => {
  const areas = db.prepare('SELECT * FROM areas ORDER BY created_at').all();
  res.json(areas);
});

app.post('/api/areas', (req, res) => {
  const { name, color, icon } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const info = db
    .prepare('INSERT INTO areas (name, color, icon) VALUES (?, ?, ?)')
    .run(name.trim(), color || '#6366f1', icon || '📁');
  res.status(201).json(db.prepare('SELECT * FROM areas WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/areas/:id', (req, res) => {
  db.prepare('DELETE FROM areas WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- trackers --------------------------------------------------------------

app.get('/api/areas/:areaId/trackers', (req, res) => {
  const trackers = db
    .prepare('SELECT * FROM trackers WHERE area_id = ? ORDER BY created_at')
    .all(req.params.areaId);
  res.json(trackers);
});

app.get('/api/trackers/:id', (req, res) => {
  const tracker = db.prepare('SELECT * FROM trackers WHERE id = ?').get(req.params.id);
  if (!tracker) return res.status(404).json({ error: 'tracker not found' });
  res.json(tracker);
});

app.post('/api/areas/:areaId/trackers', (req, res) => {
  const area = db.prepare('SELECT id FROM areas WHERE id = ?').get(req.params.areaId);
  if (!area) return res.status(404).json({ error: 'area not found' });

  const { name, unit, type, schedule_freq, schedule_dow } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const info = db
    .prepare(
      `INSERT INTO trackers (area_id, name, unit, type, schedule_freq, schedule_dow)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      req.params.areaId,
      name.trim(),
      unit || '',
      type || 'number',
      schedule_freq || 'weekly',
      schedule_dow == null ? null : Number(schedule_dow),
    );
  res.status(201).json(db.prepare('SELECT * FROM trackers WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/trackers/:id', (req, res) => {
  db.prepare('DELETE FROM trackers WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- entries ---------------------------------------------------------------

app.get('/api/trackers/:id/entries', (req, res) => {
  const entries = db
    .prepare('SELECT * FROM entries WHERE tracker_id = ? ORDER BY date, id')
    .all(req.params.id);
  res.json(entries);
});

app.post('/api/trackers/:id/entries', (req, res) => {
  const tracker = db.prepare('SELECT id FROM trackers WHERE id = ?').get(req.params.id);
  if (!tracker) return res.status(404).json({ error: 'tracker not found' });

  const { value, note, date } = req.body || {};
  if (value == null || Number.isNaN(Number(value)))
    return res.status(400).json({ error: 'numeric value is required' });

  const info = db
    .prepare('INSERT INTO entries (tracker_id, value, note, date) VALUES (?, ?, ?, ?)')
    .run(req.params.id, Number(value), note || '', date || todayISO());
  res.status(201).json(db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/entries/:id', (req, res) => {
  db.prepare('DELETE FROM entries WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- items (goals/tasks/notes) --------------------------------------------

app.get('/api/areas/:areaId/items', (req, res) => {
  const items = db
    .prepare('SELECT * FROM items WHERE area_id = ? ORDER BY created_at DESC')
    .all(req.params.areaId);
  res.json(items);
});

app.post('/api/areas/:areaId/items', (req, res) => {
  const { type, content, status } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });
  const info = db
    .prepare('INSERT INTO items (area_id, type, content, status) VALUES (?, ?, ?, ?)')
    .run(req.params.areaId, type || 'goal', content.trim(), status || 'open');
  res.status(201).json(db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid));
});

app.patch('/api/items/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'item not found' });
  const { content, status } = req.body || {};
  db.prepare('UPDATE items SET content = ?, status = ? WHERE id = ?').run(
    content ?? existing.content,
    status ?? existing.status,
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id));
});

app.delete('/api/items/:id', (req, res) => {
  db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- due today -------------------------------------------------------------
// A tracker is "due today" when its schedule matches today and it has no
// entry dated today yet.

app.get('/api/due-today', (req, res) => {
  const today = todayISO();
  const dow = new Date().getDay(); // 0=Sun..6=Sat
  const trackers = db
    .prepare(
      `SELECT t.*, a.name AS area_name, a.color AS area_color, a.icon AS area_icon
       FROM trackers t JOIN areas a ON a.id = t.area_id`,
    )
    .all();

  const due = [];
  for (const t of trackers) {
    const matchesSchedule =
      t.schedule_freq === 'daily' ||
      (t.schedule_freq === 'weekly' && Number(t.schedule_dow) === dow);
    if (!matchesSchedule) continue;

    const loggedToday = db
      .prepare('SELECT 1 FROM entries WHERE tracker_id = ? AND date = ? LIMIT 1')
      .get(t.id, today);
    if (!loggedToday) due.push(t);
  }
  res.json(due);
});

// --- AI weekly reflection --------------------------------------------------

app.post(
  '/api/ai/reflect',
  wrap(async (req, res) => {
    const weekStart = daysAgoISO(7);
    const weekEnd = todayISO();

    const areas = db.prepare('SELECT * FROM areas').all();
    const trackers = db.prepare('SELECT * FROM trackers').all();
    const entries = db
      .prepare('SELECT * FROM entries WHERE date >= ? ORDER BY date')
      .all(weekStart);
    const items = db.prepare('SELECT * FROM items').all();

    const provider = getAIProvider();
    const result = await provider.reflect({
      weekStart,
      weekEnd,
      areas,
      trackers,
      entries,
      items,
    });
    res.json(result);
  }),
);

// --- error handler ---------------------------------------------------------

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'internal error' });
});

app.listen(PORT, () => {
  console.log(`KamalTrack API listening on http://localhost:${PORT}`);
  console.log(`AI provider: ${process.env.AI_PROVIDER || 'mock'}`);
});
