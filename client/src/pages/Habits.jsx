import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

export default function Habits() {
  const [date, setDate] = useState(todayISO());
  const [day, setDay] = useState(null); // { date, habits, stats }
  const [newName, setNewName] = useState('');
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
      await api.createHabit({ name: newName });
      setNewName('');
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

  // Clicking Yes/No toggles that value; clicking the active one again clears it.
  const setValue = async (habit, target) => {
    const next = habit.value === target ? null : target;
    // optimistic update
    setDay((prev) => {
      const habits = prev.habits.map((h) =>
        h.id === habit.id ? { ...h, value: next } : h,
      );
      const marked = habits.filter((h) => h.value !== null);
      const yes = marked.filter((h) => h.value === 1).length;
      const percent = marked.length ? Math.round((yes / marked.length) * 100) : 0;
      return { ...prev, habits, stats: { marked: marked.length, yes, no: marked.length - yes, percent } };
    });
    try {
      await api.setHabitLog(habit.id, date, next);
    } catch (err) {
      setError(err.message);
      await load(); // reconcile on failure
    }
  };

  const isToday = date === todayISO();
  const stats = day?.stats ?? { marked: 0, yes: 0, no: 0, percent: 0 };

  return (
    <div>
      <div className="crumbs">
        <Link to="/">← Dashboard</Link>
      </div>
      <h1>Daily habits</h1>
      <p className="muted">
        Pick what you want to do every day. Tap green for done, red for not — leave blank if it
        didn&apos;t apply.
      </p>

      {/* Date navigation */}
      <div className="habit-datenav">
        <button className="ghost" onClick={() => setDate((d) => shiftDate(d, -1))}>
          ← Prev
        </button>
        <div className="habit-date">
          <strong>{prettyDate(date)}</strong>
          {isToday && <span className="today-pill">Today</span>}
        </div>
        <button
          className="ghost"
          onClick={() => setDate((d) => shiftDate(d, 1))}
          disabled={isToday}
          title={isToday ? "Can't go to the future" : 'Next day'}
        >
          Next →
        </button>
        {!isToday && (
          <button className="ghost" onClick={() => setDate(todayISO())}>
            Jump to today
          </button>
        )}
      </div>

      {/* Daily completion bar */}
      <div className="card habit-summary">
        <div className="habit-summary-top">
          <span>Today&apos;s habits</span>
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

      {/* Habit rows */}
      <div className="section">
        {!day ? (
          <div className="empty">Loading…</div>
        ) : day.habits.length === 0 ? (
          <div className="empty">No habits yet. Add your first one below.</div>
        ) : (
          day.habits.map((h) => (
            <div key={h.id} className="habit-row">
              <span className="habit-name">{h.name}</span>
              <div className="habit-toggle">
                <button
                  className={`yn yes ${h.value === 1 ? 'active' : ''}`}
                  onClick={() => setValue(h, 1)}
                  aria-pressed={h.value === 1}
                >
                  Yes
                </button>
                <button
                  className={`yn no ${h.value === 0 ? 'active' : ''}`}
                  onClick={() => setValue(h, 0)}
                  aria-pressed={h.value === 0}
                >
                  No
                </button>
              </div>
              <button className="danger habit-del" onClick={() => removeHabit(h.id, h.name)}>
                ✕
              </button>
            </div>
          ))
        )}

        <form className="add-item" onSubmit={addHabit} style={{ marginTop: 14 }}>
          <div className="add-item-row">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New daily habit, e.g. Workout, Read 20 min, No sugar"
            />
            <button type="submit" disabled={!newName.trim()}>
              + Add habit
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      </div>
    </div>
  );
}
