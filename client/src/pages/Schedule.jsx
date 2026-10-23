import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api.js';

/* ---------------- date helpers (local, no deps) ---------------- */
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
  // Monday-based week (Google default in much of the world; matches user locale pref)
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // 0=Mon..6=Sun
  x.setDate(x.getDate() - dow);
  return x;
};
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const EVENT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];

export default function Schedule() {
  const [view, setView] = useState('month'); // month | week | day
  const [cursor, setCursor] = useState(() => new Date()); // anchor date for the view
  const [events, setEvents] = useState([]);
  const [modal, setModal] = useState(null); // { event } for edit, { date, start_time } for new
  const [error, setError] = useState('');

  // Compute the visible date range for the current view (to query the API).
  const range = useMemo(() => {
    if (view === 'day') {
      return { from: iso(cursor), to: iso(cursor) };
    }
    if (view === 'week') {
      const s = startOfWeekMon(cursor);
      return { from: iso(s), to: iso(addDays(s, 6)) };
    }
    // month: pad to full weeks
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeekMon(first);
    return { from: iso(gridStart), to: iso(addDays(gridStart, 41)) };
  }, [view, cursor]);

  const load = useCallback(async () => {
    try {
      setEvents(await api.getEvents(range.from, range.to));
    } catch (e) {
      setError(e.message);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  const eventsOn = (dayISO) =>
    events
      .filter((e) => e.date === dayISO)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  const go = (dir) => {
    if (view === 'month') setCursor((c) => addMonths(c, dir));
    else if (view === 'week') setCursor((c) => addDays(c, dir * 7));
    else setCursor((c) => addDays(c, dir));
  };

  const title = useMemo(() => {
    if (view === 'month') return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === 'week') {
      const s = startOfWeekMon(cursor);
      const e = addDays(s, 6);
      const sameMonth = s.getMonth() === e.getMonth();
      return sameMonth
        ? `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
        : `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
    }
    return cursor.toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }, [view, cursor]);

  return (
    <div>
      <div className="cal-header">
        <h1 style={{ margin: 0 }}>Schedule</h1>
        <div className="cal-controls">
          <button className="ghost" onClick={() => setCursor(new Date())}>
            Today
          </button>
          <div className="cal-nav">
            <button className="ghost" onClick={() => go(-1)} aria-label="Previous">
              ‹
            </button>
            <button className="ghost" onClick={() => go(1)} aria-label="Next">
              ›
            </button>
          </div>
          <div className="cal-title">{title}</div>
          <div className="cal-views">
            {['month', 'week', 'day'].map((v) => (
              <button
                key={v}
                className={`vbtn ${view === v ? 'active' : ''}`}
                onClick={() => setView(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={() => setModal({ date: todayISO() })}>+ Event</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {view === 'month' && (
        <MonthView cursor={cursor} eventsOn={eventsOn} onDayClick={(d) => setModal({ date: d })} onEventClick={(ev) => setModal({ event: ev })} />
      )}
      {view === 'week' && (
        <WeekView cursor={cursor} eventsOn={eventsOn} onSlotClick={(d, t) => setModal({ date: d, start_time: t })} onEventClick={(ev) => setModal({ event: ev })} />
      )}
      {view === 'day' && (
        <DayView cursor={cursor} eventsOn={eventsOn} onSlotClick={(d, t) => setModal({ date: d, start_time: t })} onEventClick={(ev) => setModal({ event: ev })} />
      )}

      {modal && (
        <EventModal
          initial={modal}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Month view ---------------- */
function MonthView({ cursor, eventsOn, onDayClick, onEventClick }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeekMon(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const month = cursor.getMonth();
  const today = todayISO();

  return (
    <div className="cal-month">
      <div className="cal-dow-row">
        {DAY_NAMES.map((d) => (
          <div key={d} className="cal-dow">{d}</div>
        ))}
      </div>
      <div className="cal-grid">
        {days.map((d) => {
          const dIso = iso(d);
          const inMonth = d.getMonth() === month;
          const dayEvents = eventsOn(dIso);
          return (
            <div
              key={dIso}
              className={`cal-cell ${inMonth ? '' : 'dim'} ${dIso === today ? 'today' : ''}`}
              onClick={() => onDayClick(dIso)}
            >
              <div className="cal-daynum">{d.getDate()}</div>
              <div className="cal-cell-events">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    className="cal-chip"
                    style={{ background: ev.color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(ev);
                    }}
                  >
                    {ev.start_time ? `${ev.start_time} ` : ''}
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <div className="cal-more">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Week view ---------------- */
function WeekView({ cursor, eventsOn, onSlotClick, onEventClick }) {
  const start = startOfWeekMon(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = todayISO();
  return (
    <div className="cal-timegrid">
      <div className="cal-timegrid-head">
        <div className="cal-time-gutter" />
        {days.map((d) => (
          <div key={iso(d)} className={`cal-col-head ${iso(d) === today ? 'today' : ''}`}>
            <div className="cal-col-dow">{DAY_NAMES[(d.getDay() + 6) % 7]}</div>
            <div className="cal-col-num">{d.getDate()}</div>
          </div>
        ))}
      </div>
      <div className="cal-timegrid-body">
        <div className="cal-time-gutter">
          {HOURS.map((h) => (
            <div key={h} className="cal-hour-label">{pad(h)}:00</div>
          ))}
        </div>
        {days.map((d) => (
          <DayColumn
            key={iso(d)}
            dayISO={iso(d)}
            events={eventsOn(iso(d))}
            onSlotClick={onSlotClick}
            onEventClick={onEventClick}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------------- Day view ---------------- */
function DayView({ cursor, eventsOn, onSlotClick, onEventClick }) {
  const dIso = iso(cursor);
  return (
    <div className="cal-timegrid day-only">
      <div className="cal-timegrid-body">
        <div className="cal-time-gutter">
          {HOURS.map((h) => (
            <div key={h} className="cal-hour-label">{pad(h)}:00</div>
          ))}
        </div>
        <DayColumn
          dayISO={dIso}
          events={eventsOn(dIso)}
          onSlotClick={onSlotClick}
          onEventClick={onEventClick}
        />
      </div>
    </div>
  );
}

/* A single day's hour column with absolutely-positioned timed events. */
function DayColumn({ dayISO, events, onSlotClick, onEventClick }) {
  const HOUR_PX = 48;
  const toMin = (t) => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const timed = events.filter((e) => e.start_time);
  const allDay = events.filter((e) => !e.start_time);

  return (
    <div className="cal-daycol">
      {allDay.length > 0 && (
        <div className="cal-allday">
          {allDay.map((ev) => (
            <button
              key={ev.id}
              className="cal-chip"
              style={{ background: ev.color }}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick(ev);
              }}
            >
              {ev.title}
            </button>
          ))}
        </div>
      )}
      <div className="cal-hours">
        {HOURS.map((h) => (
          <div
            key={h}
            className="cal-slot"
            style={{ height: HOUR_PX }}
            onClick={() => onSlotClick(dayISO, `${pad(h)}:00`)}
          />
        ))}
        {timed.map((ev) => {
          const startMin = toMin(ev.start_time);
          const endMin = toMin(ev.end_time) ?? startMin + 60;
          const top = (startMin / 60) * HOUR_PX;
          const height = Math.max(22, ((endMin - startMin) / 60) * HOUR_PX);
          return (
            <button
              key={ev.id}
              className="cal-event-block"
              style={{ top, height, background: ev.color }}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick(ev);
              }}
            >
              <strong>{ev.title}</strong>
              <span>
                {ev.start_time}
                {ev.end_time ? `–${ev.end_time}` : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Add / edit event modal ---------------- */
function EventModal({ initial, onClose, onSaved }) {
  const editing = !!initial.event;
  const ev = initial.event || {};
  const [title, setTitle] = useState(ev.title || '');
  const [date, setDate] = useState(ev.date || initial.date || todayISO());
  const [start, setStart] = useState(ev.start_time || initial.start_time || '');
  const [end, setEnd] = useState(ev.end_time || '');
  const [color, setColor] = useState(ev.color || EVENT_COLORS[0]);
  const [notes, setNotes] = useState(ev.notes || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = {
        title,
        date,
        start_time: start || null,
        end_time: end || null,
        color,
        notes,
      };
      if (editing) await api.updateEvent(ev.id, payload);
      else await api.createEvent(payload);
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('Delete this event?')) return;
    setBusy(true);
    try {
      await api.deleteEvent(ev.id);
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? 'Edit event' : 'New event'}</h2>
        <form onSubmit={save}>
          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Study block" autoFocus />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="row">
            <div className="field">
              <label>Start (leave blank = all-day)</label>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="field">
              <label>End</label>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Color</label>
            <div className="color-row">
              {EVENT_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`swatch ${color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`color ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
          </div>
          {error && <div className="error">{error}</div>}
          <div className="row" style={{ marginTop: 10 }}>
            <button type="submit" disabled={busy || !title.trim()}>
              {editing ? 'Save' : 'Create'}
            </button>
            {editing && (
              <button type="button" className="ghost" onClick={remove} disabled={busy} style={{ color: 'var(--danger)' }}>
                Delete
              </button>
            )}
            <button type="button" className="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
