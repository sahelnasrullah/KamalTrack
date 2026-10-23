import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { query, initSchema } from './db.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  generateResetToken,
  hashResetToken,
} from './auth.js';
import { getAIProvider } from './ai/index.js';

const app = express();
app.use(cors());
app.use(express.json());
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
function daysAheadISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const uid = (req) => req.user.id;

// --- health ----------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ ok: true, provider: process.env.AI_PROVIDER || 'mock' });
});

// --- auth ------------------------------------------------------------------

function validEmail(e) {
  return typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

app.post(
  '/api/auth/signup',
  wrap(async (req, res) => {
    const { email, password, name } = req.body || {};
    if (!validEmail(email)) return res.status(400).json({ error: 'a valid email is required' });
    if (!password || password.length < 8)
      return res.status(400).json({ error: 'password must be at least 8 characters' });

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'email already registered' });

    const hash = await hashPassword(password);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
       RETURNING id, email, name`,
      [email.toLowerCase(), hash, (name || '').trim()],
    );
    const user = rows[0];
    const token = signToken(user, false);
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  }),
);

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const { email, password, remember } = req.body || {};
    if (!validEmail(email) || !password)
      return res.status(400).json({ error: 'email and password are required' });

    const { rows } = await query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    const user = rows[0];
    const ok = user && (await verifyPassword(password, user.password_hash));
    // Same response time / message whether email or password was wrong.
    if (!ok) return res.status(401).json({ error: 'invalid email or password' });

    const token = signToken(user, !!remember);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  }),
);

app.get(
  '/api/auth/me',
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query('SELECT id, email, name FROM users WHERE id = $1', [uid(req)]);
    if (!rows.length) return res.status(404).json({ error: 'user not found' });
    res.json({ user: rows[0] });
  }),
);

// Password reset — request: always returns 200 (don't leak which emails exist).
// Returns the raw token in dev so the flow is testable; in production this
// token would be emailed instead (email delivery is a separate seam).
app.post(
  '/api/auth/reset/request',
  wrap(async (req, res) => {
    const { email } = req.body || {};
    const exposeToken = process.env.NODE_ENV !== 'production';
    if (!validEmail(email)) return res.json({ ok: true });

    const { rows } = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!rows.length) return res.json({ ok: true });

    const { raw, hash } = generateResetToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [rows[0].id, hash, expires.toISOString()],
    );
    // TODO(email seam): send `raw` to the user's email with a reset link.
    res.json({ ok: true, ...(exposeToken ? { devToken: raw } : {}) });
  }),
);

app.post(
  '/api/auth/reset/confirm',
  wrap(async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password || password.length < 8)
      return res.status(400).json({ error: 'token and a password (min 8 chars) are required' });

    const tokenHash = hashResetToken(token);
    const { rows } = await query(
      `SELECT * FROM password_resets
       WHERE token_hash = $1 AND used = false AND expires_at > now()
       ORDER BY id DESC LIMIT 1`,
      [tokenHash],
    );
    if (!rows.length) return res.status(400).json({ error: 'invalid or expired reset token' });

    const reset = rows[0];
    const hash = await hashPassword(password);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, reset.user_id]);
    await query('UPDATE password_resets SET used = true WHERE id = $1', [reset.id]);
    res.json({ ok: true });
  }),
);

// Everything below requires authentication and is scoped to req.user.id.
app.use('/api', (req, res, next) => {
  // Public endpoints handled above; protect the rest.
  if (
    req.path === '/health' ||
    req.path.startsWith('/auth/')
  ) {
    return next();
  }
  return requireAuth(req, res, next);
});

// --- areas -----------------------------------------------------------------

app.get(
  '/api/areas',
  wrap(async (req, res) => {
    const { rows } = await query(
      'SELECT * FROM areas WHERE user_id = $1 ORDER BY created_at',
      [uid(req)],
    );
    res.json(rows);
  }),
);

app.post(
  '/api/areas',
  wrap(async (req, res) => {
    const { name, color, icon } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      'INSERT INTO areas (user_id, name, color, icon) VALUES ($1, $2, $3, $4) RETURNING *',
      [uid(req), name.trim(), color || '#6366f1', icon || '📁'],
    );
    res.status(201).json(rows[0]);
  }),
);

app.delete(
  '/api/areas/:id',
  wrap(async (req, res) => {
    await query('DELETE FROM areas WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
    res.status(204).end();
  }),
);

// --- trackers --------------------------------------------------------------

app.get(
  '/api/areas/:areaId/trackers',
  wrap(async (req, res) => {
    const { rows } = await query(
      'SELECT * FROM trackers WHERE area_id = $1 AND user_id = $2 ORDER BY created_at',
      [req.params.areaId, uid(req)],
    );
    res.json(rows);
  }),
);

app.get(
  '/api/trackers/:id',
  wrap(async (req, res) => {
    const { rows } = await query('SELECT * FROM trackers WHERE id = $1 AND user_id = $2', [
      req.params.id,
      uid(req),
    ]);
    if (!rows.length) return res.status(404).json({ error: 'tracker not found' });
    res.json(rows[0]);
  }),
);

app.post(
  '/api/areas/:areaId/trackers',
  wrap(async (req, res) => {
    // Ownership check: the area must belong to this user.
    const area = await query('SELECT id FROM areas WHERE id = $1 AND user_id = $2', [
      req.params.areaId,
      uid(req),
    ]);
    if (!area.rows.length) return res.status(404).json({ error: 'area not found' });

    const { name, unit, type, schedule_freq, schedule_dow } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

    const { rows } = await query(
      `INSERT INTO trackers (user_id, area_id, name, unit, type, schedule_freq, schedule_dow)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        uid(req),
        req.params.areaId,
        name.trim(),
        unit || '',
        type || 'number',
        schedule_freq || 'weekly',
        schedule_dow == null ? null : Number(schedule_dow),
      ],
    );
    res.status(201).json(rows[0]);
  }),
);

app.delete(
  '/api/trackers/:id',
  wrap(async (req, res) => {
    await query('DELETE FROM trackers WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
    res.status(204).end();
  }),
);

// --- entries ---------------------------------------------------------------

app.get(
  '/api/trackers/:id/entries',
  wrap(async (req, res) => {
    const { rows } = await query(
      'SELECT * FROM entries WHERE tracker_id = $1 AND user_id = $2 ORDER BY date, id',
      [req.params.id, uid(req)],
    );
    res.json(rows);
  }),
);

app.post(
  '/api/trackers/:id/entries',
  wrap(async (req, res) => {
    const tracker = await query('SELECT id FROM trackers WHERE id = $1 AND user_id = $2', [
      req.params.id,
      uid(req),
    ]);
    if (!tracker.rows.length) return res.status(404).json({ error: 'tracker not found' });

    const { value, note, date } = req.body || {};
    if (value == null || Number.isNaN(Number(value)))
      return res.status(400).json({ error: 'numeric value is required' });

    const { rows } = await query(
      'INSERT INTO entries (user_id, tracker_id, value, note, date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [uid(req), req.params.id, Number(value), note || '', date || todayISO()],
    );
    res.status(201).json(rows[0]);
  }),
);

app.delete(
  '/api/entries/:id',
  wrap(async (req, res) => {
    await query('DELETE FROM entries WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
    res.status(204).end();
  }),
);

// --- items (goals/tasks/notes) --------------------------------------------

// Compute goal progress (0..1) from the latest entry of a tracker.
async function computeProgress(item, userId) {
  if (item.type !== 'goal' || item.tracker_id == null || item.target_value == null) return null;
  const latestRow = (
    await query(
      'SELECT value FROM entries WHERE tracker_id = $1 AND user_id = $2 ORDER BY date DESC, id DESC LIMIT 1',
      [item.tracker_id, userId],
    )
  ).rows[0];
  const baselineRow = (
    await query(
      'SELECT value FROM entries WHERE tracker_id = $1 AND user_id = $2 ORDER BY date ASC, id ASC LIMIT 1',
      [item.tracker_id, userId],
    )
  ).rows[0];
  if (!latestRow) return { progress: 0, latest: null, target: item.target_value };

  const latest = latestRow.value;
  const target = item.target_value;
  const baseline = baselineRow ? baselineRow.value : latest;

  let progress;
  if (item.target_direction === 'at_most') {
    if (baseline <= target) progress = 1;
    else progress = (baseline - latest) / (baseline - target);
  } else {
    if (target <= baseline) progress = latest >= target ? 1 : 0;
    else progress = (latest - baseline) / (target - baseline);
  }
  progress = Math.max(0, Math.min(1, progress));
  return { progress, latest, baseline, target, reached: progress >= 1 };
}

async function withProgress(item, userId) {
  const p = await computeProgress(item, userId);
  return p ? { ...item, progress: p } : item;
}

app.get(
  '/api/areas/:areaId/items',
  wrap(async (req, res) => {
    const { rows } = await query(
      'SELECT * FROM items WHERE area_id = $1 AND user_id = $2 AND tracker_id IS NULL ORDER BY created_at DESC',
      [req.params.areaId, uid(req)],
    );
    res.json(await Promise.all(rows.map((r) => withProgress(r, uid(req)))));
  }),
);

app.post(
  '/api/areas/:areaId/items',
  wrap(async (req, res) => {
    const area = await query('SELECT id FROM areas WHERE id = $1 AND user_id = $2', [
      req.params.areaId,
      uid(req),
    ]);
    if (!area.rows.length) return res.status(404).json({ error: 'area not found' });

    const { type, content, status, target_value, target_direction } = req.body || {};
    if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });
    const { rows } = await query(
      `INSERT INTO items (user_id, area_id, tracker_id, type, content, status, target_value, target_direction)
       VALUES ($1, $2, NULL, $3, $4, $5, $6, $7) RETURNING *`,
      [
        uid(req),
        req.params.areaId,
        type || 'goal',
        content.trim(),
        status || 'open',
        target_value == null || target_value === '' ? null : Number(target_value),
        target_direction || 'at_least',
      ],
    );
    res.status(201).json(await withProgress(rows[0], uid(req)));
  }),
);

app.get(
  '/api/trackers/:trackerId/items',
  wrap(async (req, res) => {
    const { rows } = await query(
      'SELECT * FROM items WHERE tracker_id = $1 AND user_id = $2 ORDER BY created_at DESC',
      [req.params.trackerId, uid(req)],
    );
    res.json(await Promise.all(rows.map((r) => withProgress(r, uid(req)))));
  }),
);

app.post(
  '/api/trackers/:trackerId/items',
  wrap(async (req, res) => {
    const tracker = (
      await query('SELECT * FROM trackers WHERE id = $1 AND user_id = $2', [
        req.params.trackerId,
        uid(req),
      ])
    ).rows[0];
    if (!tracker) return res.status(404).json({ error: 'tracker not found' });

    const { type, content, status, target_value, target_direction } = req.body || {};
    if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });

    let dir = target_direction;
    if (type === 'goal' && target_value != null && target_value !== '' && !dir) {
      const latest = (
        await query(
          'SELECT value FROM entries WHERE tracker_id = $1 AND user_id = $2 ORDER BY date DESC, id DESC LIMIT 1',
          [req.params.trackerId, uid(req)],
        )
      ).rows[0];
      dir = latest && latest.value > Number(target_value) ? 'at_most' : 'at_least';
    }

    const { rows } = await query(
      `INSERT INTO items (user_id, area_id, tracker_id, type, content, status, target_value, target_direction)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        uid(req),
        tracker.area_id,
        req.params.trackerId,
        type || 'goal',
        content.trim(),
        status || 'open',
        target_value == null || target_value === '' ? null : Number(target_value),
        dir || 'at_least',
      ],
    );
    res.status(201).json(await withProgress(rows[0], uid(req)));
  }),
);

app.patch(
  '/api/items/:id',
  wrap(async (req, res) => {
    const existing = (
      await query('SELECT * FROM items WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)])
    ).rows[0];
    if (!existing) return res.status(404).json({ error: 'item not found' });
    const { content, status, target_value, target_direction } = req.body || {};
    const { rows } = await query(
      `UPDATE items SET content = $1, status = $2, target_value = $3, target_direction = $4
       WHERE id = $5 AND user_id = $6 RETURNING *`,
      [
        content ?? existing.content,
        status ?? existing.status,
        target_value === undefined
          ? existing.target_value
          : target_value === '' || target_value === null
            ? null
            : Number(target_value),
        target_direction ?? existing.target_direction,
        req.params.id,
        uid(req),
      ],
    );
    res.json(await withProgress(rows[0], uid(req)));
  }),
);

app.delete(
  '/api/items/:id',
  wrap(async (req, res) => {
    await query('DELETE FROM items WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
    res.status(204).end();
  }),
);

// --- due today -------------------------------------------------------------

app.get(
  '/api/due-today',
  wrap(async (req, res) => {
    const today = todayISO();
    const dow = new Date().getDay();
    const { rows: trackers } = await query(
      `SELECT t.*, a.name AS area_name, a.color AS area_color, a.icon AS area_icon
       FROM trackers t JOIN areas a ON a.id = t.area_id
       WHERE t.user_id = $1`,
      [uid(req)],
    );

    const due = [];
    for (const t of trackers) {
      const matches =
        t.schedule_freq === 'daily' ||
        (t.schedule_freq === 'weekly' && Number(t.schedule_dow) === dow);
      if (!matches) continue;
      const logged = await query(
        'SELECT 1 FROM entries WHERE tracker_id = $1 AND date = $2 LIMIT 1',
        [t.id, today],
      );
      if (!logged.rows.length) due.push(t);
    }
    res.json(due);
  }),
);

// --- habits ----------------------------------------------------------------

app.get(
  '/api/habits',
  wrap(async (req, res) => {
    const { rows } = await query(
      'SELECT * FROM habits WHERE user_id = $1 AND archived = false ORDER BY is_core DESC, sort_order, id',
      [uid(req)],
    );
    res.json(rows);
  }),
);

app.post(
  '/api/habits',
  wrap(async (req, res) => {
    const { name, color, is_core } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const maxOrder = (
      await query('SELECT COALESCE(MAX(sort_order), 0) AS m FROM habits WHERE user_id = $1', [
        uid(req),
      ])
    ).rows[0].m;
    const { rows } = await query(
      'INSERT INTO habits (user_id, name, color, is_core, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [uid(req), name.trim(), color || '#6366f1', !!is_core, Number(maxOrder) + 1],
    );
    res.status(201).json(rows[0]);
  }),
);

app.patch(
  '/api/habits/:id',
  wrap(async (req, res) => {
    const existing = (
      await query('SELECT * FROM habits WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)])
    ).rows[0];
    if (!existing) return res.status(404).json({ error: 'habit not found' });
    const { name, color, is_core } = req.body || {};
    const { rows } = await query(
      'UPDATE habits SET name = $1, color = $2, is_core = $3 WHERE id = $4 AND user_id = $5 RETURNING *',
      [
        name ?? existing.name,
        color ?? existing.color,
        is_core === undefined ? existing.is_core : !!is_core,
        req.params.id,
        uid(req),
      ],
    );
    res.json(rows[0]);
  }),
);

app.delete(
  '/api/habits/:id',
  wrap(async (req, res) => {
    await query('DELETE FROM habits WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
    res.status(204).end();
  }),
);

app.get(
  '/api/habits/day/:date',
  wrap(async (req, res) => {
    const date = req.params.date;
    const { rows } = await query(
      `SELECT h.id, h.name, h.color, h.is_core, h.sort_order, l.value AS value
       FROM habits h
       LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.date = $2
       WHERE h.user_id = $1 AND h.archived = false
       ORDER BY h.is_core DESC, h.sort_order, h.id`,
      [uid(req), date],
    );
    const marked = rows.filter((r) => r.value !== null);
    const yes = marked.filter((r) => r.value === 1).length;
    const percent = marked.length ? Math.round((yes / marked.length) * 100) : 0;
    res.json({
      date,
      habits: rows,
      stats: { marked: marked.length, yes, no: marked.length - yes, percent },
    });
  }),
);

app.get(
  '/api/habits/range',
  wrap(async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
    const habits = (
      await query(
        'SELECT * FROM habits WHERE user_id = $1 AND archived = false ORDER BY is_core DESC, sort_order, id',
        [uid(req)],
      )
    ).rows;
    const logs = (
      await query(
        'SELECT habit_id, date, value FROM habit_logs WHERE user_id = $1 AND date >= $2 AND date <= $3',
        [uid(req), from, to],
      )
    ).rows;
    res.json({ from, to, habits, logs });
  }),
);

app.put(
  '/api/habits/:id/log/:date',
  wrap(async (req, res) => {
    const habit = await query('SELECT id FROM habits WHERE id = $1 AND user_id = $2', [
      req.params.id,
      uid(req),
    ]);
    if (!habit.rows.length) return res.status(404).json({ error: 'habit not found' });

    const { value } = req.body || {};
    if (value === null || value === undefined) {
      await query('DELETE FROM habit_logs WHERE habit_id = $1 AND date = $2 AND user_id = $3', [
        req.params.id,
        req.params.date,
        uid(req),
      ]);
      return res.json({ habit_id: Number(req.params.id), date: req.params.date, value: null });
    }
    const v = Number(value) === 1 ? 1 : 0;
    await query(
      `INSERT INTO habit_logs (user_id, habit_id, date, value) VALUES ($1, $2, $3, $4)
       ON CONFLICT (habit_id, date) DO UPDATE SET value = EXCLUDED.value`,
      [uid(req), req.params.id, req.params.date, v],
    );
    res.json({ habit_id: Number(req.params.id), date: req.params.date, value: v });
  }),
);

// --- calendar events -------------------------------------------------------

app.get(
  '/api/events',
  wrap(async (req, res) => {
    const { from, to } = req.query;
    let result;
    if (from && to) {
      result = await query(
        'SELECT * FROM events WHERE user_id = $1 AND date >= $2 AND date <= $3 ORDER BY date, start_time, id',
        [uid(req), from, to],
      );
    } else {
      result = await query(
        'SELECT * FROM events WHERE user_id = $1 ORDER BY date, start_time, id',
        [uid(req)],
      );
    }
    res.json(result.rows);
  }),
);

app.post(
  '/api/events',
  wrap(async (req, res) => {
    const { title, date, start_time, end_time, color, notes } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
    if (!date) return res.status(400).json({ error: 'date is required' });
    const { rows } = await query(
      `INSERT INTO events (user_id, title, date, start_time, end_time, color, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        uid(req),
        title.trim(),
        date,
        start_time || null,
        end_time || null,
        color || '#6366f1',
        notes || '',
      ],
    );
    res.status(201).json(rows[0]);
  }),
);

app.patch(
  '/api/events/:id',
  wrap(async (req, res) => {
    const existing = (
      await query('SELECT * FROM events WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)])
    ).rows[0];
    if (!existing) return res.status(404).json({ error: 'event not found' });
    const { title, date, start_time, end_time, color, notes } = req.body || {};
    const { rows } = await query(
      `UPDATE events SET title = $1, date = $2, start_time = $3, end_time = $4, color = $5, notes = $6
       WHERE id = $7 AND user_id = $8 RETURNING *`,
      [
        title ?? existing.title,
        date ?? existing.date,
        start_time === undefined ? existing.start_time : start_time || null,
        end_time === undefined ? existing.end_time : end_time || null,
        color ?? existing.color,
        notes ?? existing.notes,
        req.params.id,
        uid(req),
      ],
    );
    res.json(rows[0]);
  }),
);

app.delete(
  '/api/events/:id',
  wrap(async (req, res) => {
    await query('DELETE FROM events WHERE id = $1 AND user_id = $2', [req.params.id, uid(req)]);
    res.status(204).end();
  }),
);

// --- iCal (.ics) import ----------------------------------------------------

function unfoldICS(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}
function parseICSDate(raw) {
  if (!raw) return null;
  const v = raw.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, time: null };
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (dt) return { date: `${dt[1]}-${dt[2]}-${dt[3]}`, time: `${dt[4]}:${dt[5]}` };
  return null;
}
function parseICS(text) {
  const lines = unfoldICS(text).split('\n');
  const events = [];
  let skippedRecurring = 0;
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur) {
        if (cur._hasRRule) skippedRecurring += 1;
        else if (cur.title && cur.start) events.push(cur);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const name = left.split(';')[0].toUpperCase();
    if (name === 'SUMMARY') cur.title = value.replace(/\\,/g, ',').replace(/\\n/gi, ' ').replace(/\\;/g, ';').trim();
    else if (name === 'DTSTART') cur.start = parseICSDate(value);
    else if (name === 'DTEND') cur.end = parseICSDate(value);
    else if (name === 'DESCRIPTION') cur.notes = value.replace(/\\,/g, ',').replace(/\\n/gi, ' ').replace(/\\;/g, ';').trim();
    else if (name === 'RRULE') cur._hasRRule = true;
  }
  return { events, skippedRecurring };
}

app.post(
  '/api/events/import',
  wrap(async (req, res) => {
    const text = typeof req.body === 'string' ? req.body : '';
    if (!text || !text.includes('BEGIN:VCALENDAR'))
      return res.status(400).json({ error: 'Body must be a valid .ics (iCalendar) file' });

    const { events, skippedRecurring } = parseICS(text);
    let imported = 0;
    for (const ev of events) {
      await query(
        `INSERT INTO events (user_id, title, date, start_time, end_time, color, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          uid(req),
          ev.title || 'Untitled',
          ev.start.date,
          ev.start.time,
          ev.end ? ev.end.time : null,
          '#06b6d4',
          ev.notes || '',
        ],
      );
      imported += 1;
    }
    res.json({ imported, skipped: skippedRecurring });
  }),
);

// --- AI weekly reflection --------------------------------------------------

app.post(
  '/api/ai/reflect',
  wrap(async (req, res) => {
    const weekStart = daysAgoISO(7);
    const weekEnd = todayISO();
    const u = uid(req);

    const areas = (await query('SELECT * FROM areas WHERE user_id = $1', [u])).rows;
    const trackers = (await query('SELECT * FROM trackers WHERE user_id = $1', [u])).rows;
    const entries = (
      await query('SELECT * FROM entries WHERE user_id = $1 AND date >= $2 ORDER BY date', [
        u,
        weekStart,
      ])
    ).rows;
    const items = (await query('SELECT * FROM items WHERE user_id = $1', [u])).rows;

    const habitRows = (
      await query(
        'SELECT * FROM habits WHERE user_id = $1 AND archived = false ORDER BY is_core DESC, sort_order, id',
        [u],
      )
    ).rows;
    const habitLogs = (
      await query(
        'SELECT habit_id, date, value FROM habit_logs WHERE user_id = $1 AND date >= $2 AND date <= $3',
        [u, weekStart, weekEnd],
      )
    ).rows;
    const habits = habitRows.map((h) => {
      const logs = habitLogs.filter((l) => l.habit_id === h.id);
      const marked = logs.length;
      const done = logs.filter((l) => l.value === 1).length;
      return { name: h.name, is_core: !!h.is_core, done, marked, rate: marked ? Math.round((done / marked) * 100) : null };
    });

    const upcomingEvents = (
      await query(
        'SELECT title, date, start_time FROM events WHERE user_id = $1 AND date >= $2 AND date <= $3 ORDER BY date, start_time',
        [u, weekEnd, daysAheadISO(7)],
      )
    ).rows;
    const recentEvents = (
      await query(
        'SELECT title, date, start_time FROM events WHERE user_id = $1 AND date >= $2 AND date < $3 ORDER BY date, start_time',
        [u, weekStart, weekEnd],
      )
    ).rows;

    const provider = getAIProvider();
    const result = await provider.reflect({
      weekStart, weekEnd, areas, trackers, entries, items, habits, upcomingEvents, recentEvents,
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

// --- boot ------------------------------------------------------------------

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`KamalTrack API listening on http://localhost:${PORT}`);
      console.log(`AI provider: ${process.env.AI_PROVIDER || 'mock'}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });
