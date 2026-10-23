import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api.js';

/* ---------------- date helpers ---------------- */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => iso(new Date());
const parse = (s) => new Date(s + 'T00:00:00');
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const addMonths = (d, n) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};
const startOfWeekMon = (d) => {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
};
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function Habits() {
  const [view, setView] = useState('day'); // day | week | month
  const [cursor, setCursor] = useState(() => new Date());

  return (
    <div>
      <div className="habit-top">
        <h1 style={{ margin: 0 }}>Daily habits</h1>
        <div className="cal-views">
          {['day', 'week', 'month'].map((v) => (
            <button
              key={v}
              className={`vbtn ${view === v ? 'active' : ''}`}
              onClick={() => setView(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {view === 'day' ? (
        <DayEntry cursor={cursor} setCursor={setCursor} />
      ) : (
        <HistoryGrid view={view} cursor={cursor} setCursor={setCursor} />
      )}
    </div>
  );
}

/* ---------------- Day: entry view (toggles + core pinning) ---------------- */
function DayEntry({ cursor, setCursor }) {
  const date = iso(cursor);
  const [day, setDay] = useState(null);
  const [newName, setNewName] = useState('');
  const [newCore, setNewCore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setDay(await api.getHabitDay(date));
  }, [date]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const addHabit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createHabit({ name: newName, is_core: newCore });
      setNewName('');
      setNewCore(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeHabit = async (id, name) => {
    if (!confirm(`Delete habit "${name}" and all its history?`)) return;
    await api.deleteHabit(id);
    await load();
  };

  const toggleCore = async (h) => {
    await api.updateHabit(h.id, { is_core: !h.is_core });
    await load();
  };

  const setValue = async (habit, target) => {
    const next = habit.value === target ? null : target;
    setDay((prev) => {
      const habits = prev.habits.map((h) => (h.id === habit.id ? { ...h, value: next } : h));
      const marked = habits.filter((h) => h.value !== null);
      const yes = marked.filter((h) => h.value === 1).length;
      const percent = marked.length ? Math.round((yes / marked.length) * 100) : 0;
      return { ...prev, habits, stats: { marked: marked.length, yes, no: marked.length - yes, percent } };
    });
    try {
      await api.setHabitLog(habit.id, date, next);
    } catch (err) {
      setError(err.message);
      await load();
    }
  };

  const isToday = date === todayISO();
  const stats = day?.stats ?? { marked: 0, yes: 0, no: 0, percent: 0 };
  const habits = day?.habits ?? [];
  const core = habits.filter((h) => h.is_core);
  const others = habits.filter((h) => !h.is_core);

  const prettyDate = parse(date).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'short',
  });

  const Row = (h) => (
    <div key={h.id} className="habit-row">
      <button
        className={`core-star ${h.is_core ? 'on' : ''}`}
        title={h.is_core ? 'Core habit (always shown first). Click to unset.' : 'Mark as core'}
        onClick={() => toggleCore(h)}
      >
        {h.is_core ? '★' : '☆'}
      </button>
      <span className="habit-name">{h.name}</span>
      <div className="habit-toggle">
        <button className={`yn yes ${h.value === 1 ? 'active' : ''}`} onClick={() => setValue(h, 1)}>
          Yes
        </button>
        <button className={`yn no ${h.value === 0 ? 'active' : ''}`} onClick={() => setValue(h, 0)}>
          No
        </button>
      </div>
      <button className="danger habit-del" onClick={() => removeHabit(h.id, h.name)}>
        ✕
      </button>
    </div>
  );

  return (
    <div>
      <p className="muted">
        Tap green for done, red for not — leave blank if it didn&apos;t apply. Star a habit to make
        it <strong>core</strong> (pinned to the top every day).
      </p>

      <div className="habit-datenav">
        <button className="ghost" onClick={() => setCursor((d) => addDays(d, -1))}>
          ← Prev
        </button>
        <div className="habit-date">
          <strong>{prettyDate}</strong>
          {isToday && <span className="today-pill">Today</span>}
        </div>
        <button className="ghost" onClick={() => setCursor((d) => addDays(d, 1))} disabled={isToday}>
          Next →
        </button>
        {!isToday && (
          <button className="ghost" onClick={() => setCursor(new Date())}>
            Jump to today
          </button>
        )}
      </div>

      <div className="card habit-summary">
        <div className="habit-summary-top">
          <span>Habits done</span>
          <strong>{stats.percent}%</strong>
        </div>
        <div className="habit-bar-track">
          <div className="habit-bar-fill" style={{ width: `${stats.percent}%` }} />
        </div>
        <div className="habit-summary-meta">
          {stats.marked === 0
            ? 'Nothing marked yet'
            : `${stats.yes} done · ${stats.no} missed · ${stats.marked} marked`}
        </div>
      </div>

      <div className="section">
        {!day ? (
          <div className="empty">Loading…</div>
        ) : habits.length === 0 ? (
          <div className="empty">No habits yet. Add your first one below.</div>
        ) : (
          <>
            {core.length > 0 && (
              <>
                <div className="habit-group-label">★ Core — every day</div>
                {core.map(Row)}
              </>
            )}
            {others.length > 0 && (
              <>
                {core.length > 0 && <div className="habit-group-label">Other habits</div>}
                {others.map(Row)}
              </>
            )}
          </>
        )}

        <form className="add-item" onSubmit={addHabit} style={{ marginTop: 14 }}>
          <div className="add-item-row">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New habit, e.g. Workout, Read 20 min"
            />
            <label className="core-check">
              <input type="checkbox" checked={newCore} onChange={(e) => setNewCore(e.target.checked)} />
              Core
            </label>
            <button type="submit" disabled={!newName.trim()}>
              + Add
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      </div>
    </div>
  );
}

/* ---------------- Week/Month: Excel-style history grid ---------------- */
function HistoryGrid({ view, cursor, setCursor }) {
  const [data, setData] = useState(null); // { habits, logs }
  const [error, setError] = useState('');

  const { from, to, days, label } = useMemo(() => {
    if (view === 'week') {
      const s = startOfWeekMon(cursor);
      const ds = Array.from({ length: 7 }, (_, i) => addDays(s, i));
      const e = addDays(s, 6);
      return {
        from: iso(s),
        to: iso(e),
        days: ds,
        label: `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${e.getDate()}`,
      };
    }
    // month
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const ds = Array.from({ length: daysInMonth }, (_, i) =>
      new Date(cursor.getFullYear(), cursor.getMonth(), i + 1),
    );
    return {
      from: iso(first),
      to: iso(ds[ds.length - 1]),
      days: ds,
      label: `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`,
    };
  }, [view, cursor]);

  const load = useCallback(async () => {
    try {
      setData(await api.getHabitRange(from, to));
    } catch (e) {
      setError(e.message);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  // Fast lookup: logs[habitId][date] = 1 | 0
  const lookup = useMemo(() => {
    const m = {};
    if (data) for (const l of data.logs) (m[l.habit_id] ||= {})[l.date] = l.value;
    return m;
  }, [data]);

  const go = (dir) => {
    if (view === 'week') setCursor((c) => addDays(c, dir * 7));
    else setCursor((c) => addMonths(c, dir));
  };

  const today = todayISO();
  const habits = data?.habits ?? [];

  // Per-habit summary (done / marked over the range)
  const habitStats = (hid) => {
    const row = lookup[hid] || {};
    const vals = Object.values(row);
    const yes = vals.filter((v) => v === 1).length;
    return { yes, marked: vals.length };
  };

  return (
    <div>
      <div className="habit-datenav">
        <button className="ghost" onClick={() => go(-1)}>‹</button>
        <div className="habit-date"><strong>{label}</strong></div>
        <button className="ghost" onClick={() => go(1)}>›</button>
        <button className="ghost" onClick={() => setCursor(new Date())}>Today</button>
      </div>

      <p className="muted">
        Green = done, red = missed, empty = not logged. Each row is a habit, each column a day.
      </p>

      {error && <div className="error">{error}</div>}

      {habits.length === 0 ? (
        <div className="empty">No habits yet. Add some in Day view.</div>
      ) : (
        <div className="grid-scroll">
          <table className="habit-grid">
            <thead>
              <tr>
                <th className="gh-name">Habit</th>
                {days.map((d) => (
                  <th key={iso(d)} className={`gh-day ${iso(d) === today ? 'today' : ''}`}>
                    <span className="gh-dow">{['M', 'T', 'W', 'T', 'F', 'S', 'S'][(d.getDay() + 6) % 7]}</span>
                    <span className="gh-num">{d.getDate()}</span>
                  </th>
                ))}
                <th className="gh-sum">Σ</th>
              </tr>
            </thead>
            <tbody>
              {habits.map((h) => {
                const s = habitStats(h.id);
                return (
                  <tr key={h.id}>
                    <td className="gc-name">
                      {h.is_core ? <span className="core-dot" title="core">★</span> : null}
                      {h.name}
                    </td>
                    {days.map((d) => {
                      const v = (lookup[h.id] || {})[iso(d)];
                      const cls = v === 1 ? 'yes' : v === 0 ? 'no' : 'empty';
                      return <td key={iso(d)} className={`gc-cell ${cls}`} title={`${h.name} · ${iso(d)}`} />;
                    })}
                    <td className="gc-sum">
                      {s.marked ? `${s.yes}/${s.marked}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
