import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import db from './db.js';
import { getAIProvider } from './ai/index.js';

const app = express();
app.use(cors());
app.use(express.json());
// Accept raw .ics uploads (text/calendar or text/plain) up to 5mb.
app.use(express.text({ type: ['text/calendar', 'text/plain'], limit: '5mb' }));

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

// Compute goal progress (0..1) from the latest entry of a tracker.
// Returns null when the item isn't a tracker-linked goal with a target.
function computeProgress(item) {
  if (item.type !== 'goal' || item.tracker_id == null || item.target_value == null) {
    return null;
  }
  const latestRow = db
    .prepare('SELECT value FROM entries WHERE tracker_id = ? ORDER BY date DESC, id DESC LIMIT 1')
    .get(item.tracker_id);
  const baselineRow = db
    .prepare('SELECT value FROM entries WHERE tracker_id = ? ORDER BY date ASC, id ASC LIMIT 1')
    .get(item.tracker_id);
  if (!latestRow) return { progress: 0, latest: null, target: item.target_value };

  const latest = latestRow.value;
  const target = item.target_value;
  const baseline = baselineRow ? baselineRow.value : latest;

  let progress;
  if (item.target_direction === 'at_most') {
    // reducing toward target (e.g. weight 82 -> 80). Progress = how much of the
    // needed reduction (baseline -> target) has been achieved.
    if (baseline <= target) progress = 1;
    else progress = (baseline - latest) / (baseline - target);
  } else {
    // at_least: increasing toward target (e.g. books 0 -> 50).
    if (target <= baseline) progress = latest >= target ? 1 : 0;
    else progress = (latest - baseline) / (target - baseline);
  }
  progress = Math.max(0, Math.min(1, progress));
  return {
    progress,
    latest,
    baseline,
    target,
    reached: progress >= 1,
  };
}

function withProgress(item) {
  const p = computeProgress(item);
  return p ? { ...item, progress: p } : item;
}

// Area-level items = items NOT tied to a specific tracker.
app.get('/api/areas/:areaId/items', (req, res) => {
  const items = db
    .prepare(
      'SELECT * FROM items WHERE area_id = ? AND tracker_id IS NULL ORDER BY created_at DESC',
    )
    .all(req.params.areaId);
  res.json(items.map(withProgress));
});

app.post('/api/areas/:areaId/items', (req, res) => {
  const { type, content, status, target_value, target_direction } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });
  const info = db
    .prepare(
      `INSERT INTO items (area_id, tracker_id, type, content, status, target_value, target_direction)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    )
    .run(
      req.params.areaId,
      type || 'goal',
      content.trim(),
      status || 'open',
      target_value == null || target_value === '' ? null : Number(target_value),
      target_direction || 'at_least',
    );
  res.status(201).json(withProgress(db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid)));
});

// Tracker-level items = items tied to a specific tracker (goals show progress).
app.get('/api/trackers/:trackerId/items', (req, res) => {
  const items = db
    .prepare('SELECT * FROM items WHERE tracker_id = ? ORDER BY created_at DESC')
    .all(req.params.trackerId);
  res.json(items.map(withProgress));
});

app.post('/api/trackers/:trackerId/items', (req, res) => {
  const tracker = db.prepare('SELECT * FROM trackers WHERE id = ?').get(req.params.trackerId);
  if (!tracker) return res.status(404).json({ error: 'tracker not found' });

  const { type, content, status, target_value, target_direction } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });

  // Infer a sensible direction if a target is given but no direction:
  // if the latest value is already above the target, assume "reduce to".
  let dir = target_direction;
  if ((type === 'goal') && target_value != null && target_value !== '' && !dir) {
    const latest = db
      .prepare('SELECT value FROM entries WHERE tracker_id = ? ORDER BY date DESC, id DESC LIMIT 1')
      .get(req.params.trackerId);
    dir = latest && latest.value > Number(target_value) ? 'at_most' : 'at_least';
  }

  const info = db
    .prepare(
      `INSERT INTO items (area_id, tracker_id, type, content, status, target_value, target_direction)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      tracker.area_id,
      req.params.trackerId,
      type || 'goal',
      content.trim(),
      status || 'open',
      target_value == null || target_value === '' ? null : Number(target_value),
      dir || 'at_least',
    );
  res.status(201).json(withProgress(db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid)));
});

app.patch('/api/items/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'item not found' });
  const { content, status, target_value, target_direction } = req.body || {};
  db.prepare(
    `UPDATE items SET content = ?, status = ?, target_value = ?, target_direction = ? WHERE id = ?`,
  ).run(
    content ?? existing.content,
    status ?? existing.status,
    target_value === undefined
      ? existing.target_value
      : target_value === '' || target_value === null
        ? null
        : Number(target_value),
    target_direction ?? existing.target_direction,
    req.params.id,
  );
  res.json(withProgress(db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id)));
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

// --- habits (daily Yes/No tracker) -----------------------------------------

// List all active habits (core first, then by order).
app.get('/api/habits', (req, res) => {
  const habits = db
    .prepare('SELECT * FROM habits WHERE archived = 0 ORDER BY is_core DESC, sort_order, id')
    .all();
  res.json(habits);
});

app.post('/api/habits', (req, res) => {
  const { name, color, is_core } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM habits').get().m;
  const info = db
    .prepare('INSERT INTO habits (name, color, is_core, sort_order) VALUES (?, ?, ?, ?)')
    .run(name.trim(), color || '#6366f1', is_core ? 1 : 0, maxOrder + 1);
  res.status(201).json(db.prepare('SELECT * FROM habits WHERE id = ?').get(info.lastInsertRowid));
});

// Toggle/update a habit (currently: core flag, name, color).
app.patch('/api/habits/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'habit not found' });
  const { name, color, is_core } = req.body || {};
  db.prepare('UPDATE habits SET name = ?, color = ?, is_core = ? WHERE id = ?').run(
    name ?? existing.name,
    color ?? existing.color,
    is_core === undefined ? existing.is_core : is_core ? 1 : 0,
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id));
});

app.delete('/api/habits/:id', (req, res) => {
  db.prepare('DELETE FROM habits WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// Get a single day: every active habit with its value for that date
// (value = 1 Yes, 0 No, or null if untouched) plus the day's completion %.
app.get('/api/habits/day/:date', (req, res) => {
  const date = req.params.date;
  const rows = db
    .prepare(
      `SELECT h.id, h.name, h.color, h.is_core, h.sort_order, l.value AS value
       FROM habits h
       LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.date = ?
       WHERE h.archived = 0
       ORDER BY h.is_core DESC, h.sort_order, h.id`,
    )
    .all(date);

  const marked = rows.filter((r) => r.value !== null);
  const yes = marked.filter((r) => r.value === 1).length;
  const percent = marked.length ? Math.round((yes / marked.length) * 100) : 0;

  res.json({
    date,
    habits: rows,
    stats: { marked: marked.length, yes, no: marked.length - yes, percent },
  });
});

// Set (or clear) a habit's value for a given date.
// body: { value: 1 | 0 | null }  — null clears the day (back to untouched).
app.put('/api/habits/:id/log/:date', (req, res) => {
  const habit = db.prepare('SELECT id FROM habits WHERE id = ?').get(req.params.id);
  if (!habit) return res.status(404).json({ error: 'habit not found' });

  const { value } = req.body || {};
  if (value === null || value === undefined) {
    db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?').run(
      req.params.id,
      req.params.date,
    );
    return res.json({ habit_id: Number(req.params.id), date: req.params.date, value: null });
  }

  const v = Number(value) === 1 ? 1 : 0;
  db.prepare(
    `INSERT INTO habit_logs (habit_id, date, value) VALUES (?, ?, ?)
     ON CONFLICT(habit_id, date) DO UPDATE SET value = excluded.value`,
  ).run(req.params.id, req.params.date, v);
  res.json({ habit_id: Number(req.params.id), date: req.params.date, value: v });
});

// --- calendar events -------------------------------------------------------

// List events, optionally within an inclusive date range: ?from=YYYY-MM-DD&to=YYYY-MM-DD
app.get('/api/events', (req, res) => {
  const { from, to } = req.query;
  let rows;
  if (from && to) {
    rows = db
      .prepare('SELECT * FROM events WHERE date >= ? AND date <= ? ORDER BY date, start_time, id')
      .all(from, to);
  } else {
    rows = db.prepare('SELECT * FROM events ORDER BY date, start_time, id').all();
  }
  res.json(rows);
});

app.post('/api/events', (req, res) => {
  const { title, date, start_time, end_time, color, notes } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
  if (!date) return res.status(400).json({ error: 'date is required' });
  const info = db
    .prepare(
      `INSERT INTO events (title, date, start_time, end_time, color, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      title.trim(),
      date,
      start_time || null,
      end_time || null,
      color || '#6366f1',
      notes || '',
    );
  res.status(201).json(db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid));
});

app.patch('/api/events/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'event not found' });
  const { title, date, start_time, end_time, color, notes } = req.body || {};
  db.prepare(
    `UPDATE events SET title = ?, date = ?, start_time = ?, end_time = ?, color = ?, notes = ?
     WHERE id = ?`,
  ).run(
    title ?? existing.title,
    date ?? existing.date,
    start_time === undefined ? existing.start_time : start_time || null,
    end_time === undefined ? existing.end_time : end_time || null,
    color ?? existing.color,
    notes ?? existing.notes,
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id));
});

app.delete('/api/events/:id', (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- iCal (.ics) import ----------------------------------------------------

// Unfold RFC 5545 folded lines (continuation lines start with space or tab).
function unfoldICS(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '');
}

// Parse "YYYYMMDD" (all-day) or "YYYYMMDDTHHMMSS[Z]" into {date, time|null}.
function parseICSDate(raw) {
  if (!raw) return null;
  const v = raw.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, time: null };
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (dt) {
    return {
      date: `${dt[1]}-${dt[2]}-${dt[3]}`,
      time: `${dt[4]}:${dt[5]}`,
    };
  }
  return null;
}

// Minimal, dependency-free VEVENT extractor. Handles single timed and all-day
// events. RRULE (recurring) events are detected and skipped (counted), since
// correct recurrence expansion is out of scope for this importer.
function parseICS(text) {
  const lines = unfoldICS(text).split('\n');
  const events = [];
  let skippedRecurring = 0;
  let cur = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur) {
        if (cur._hasRRule) {
          skippedRecurring += 1;
        } else if (cur.title && cur.start) {
          events.push(cur);
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const left = line.slice(0, idx); // may include ;params
    const value = line.slice(idx + 1);
    const name = left.split(';')[0].toUpperCase();

    if (name === 'SUMMARY') {
      cur.title = value.replace(/\\,/g, ',').replace(/\\n/gi, ' ').replace(/\\;/g, ';').trim();
    } else if (name === 'DTSTART') {
      cur.start = parseICSDate(value);
    } else if (name === 'DTEND') {
      cur.end = parseICSDate(value);
    } else if (name === 'DESCRIPTION') {
      cur.notes = value.replace(/\\,/g, ',').replace(/\\n/gi, ' ').replace(/\\;/g, ';').trim();
    } else if (name === 'RRULE') {
      cur._hasRRule = true;
    }
  }

  return { events, skippedRecurring };
}

app.post('/api/events/import', (req, res) => {
  const text = typeof req.body === 'string' ? req.body : '';
  if (!text || !text.includes('BEGIN:VCALENDAR')) {
    return res.status(400).json({ error: 'Body must be a valid .ics (iCalendar) file' });
  }

  const { events, skippedRecurring } = parseICS(text);

  const insert = db.prepare(
    `INSERT INTO events (title, date, start_time, end_time, color, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction((rows) => {
    let n = 0;
    for (const ev of rows) {
      insert.run(
        ev.title || 'Untitled',
        ev.start.date,
        ev.start.time, // null for all-day
        ev.end ? ev.end.time : null,
        '#06b6d4', // distinct color for imported events
        ev.notes || '',
      );
      n += 1;
    }
    return n;
  });

  const imported = tx(events);
  res.json({ imported, skipped: skippedRecurring });
});

// --- habits range (for the Excel-style history grid) ----------------------

// All habit logs between two dates (inclusive), for building the grid.
app.get('/api/habits/range', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
  const habits = db
    .prepare('SELECT * FROM habits WHERE archived = 0 ORDER BY is_core DESC, sort_order, id')
    .all();
  const logs = db
    .prepare('SELECT habit_id, date, value FROM habit_logs WHERE date >= ? AND date <= ?')
    .all(from, to);
  res.json({ from, to, habits, logs });
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
