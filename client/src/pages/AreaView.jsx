import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';

const DOW = [
  { v: 1, label: 'Monday' },
  { v: 2, label: 'Tuesday' },
  { v: 3, label: 'Wednesday' },
  { v: 4, label: 'Thursday' },
  { v: 5, label: 'Friday' },
  { v: 6, label: 'Saturday' },
  { v: 0, label: 'Sunday' },
];

export default function AreaView() {
  const { areaId } = useParams();
  const navigate = useNavigate();
  const [area, setArea] = useState(null);
  const [trackers, setTrackers] = useState([]);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  // tracker form
  const [tName, setTName] = useState('');
  const [tUnit, setTUnit] = useState('');
  const [tFreq, setTFreq] = useState('weekly');
  const [tDow, setTDow] = useState(1);

  // item form
  const [iContent, setIContent] = useState('');
  const [iType, setIType] = useState('goal');

  const load = useCallback(async () => {
    const areas = await api.getAreas();
    setArea(areas.find((a) => String(a.id) === String(areaId)) || null);
    setTrackers(await api.getTrackers(areaId));
    setItems(await api.getItems(areaId));
  }, [areaId]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const addTracker = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createTracker(areaId, {
        name: tName,
        unit: tUnit,
        type: 'number',
        schedule_freq: tFreq,
        schedule_dow: tFreq === 'weekly' ? Number(tDow) : null,
      });
      setTName('');
      setTUnit('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const addItem = async (e) => {
    e.preventDefault();
    try {
      await api.createItem(areaId, { type: iType, content: iContent });
      setIContent('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleItem = async (it) => {
    await api.updateItem(it.id, { status: it.status === 'done' ? 'open' : 'done' });
    await load();
  };

  const removeItem = async (id) => {
    await api.deleteItem(id);
    await load();
  };

  const removeTracker = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this tracker and all its entries?')) return;
    await api.deleteTracker(id);
    await load();
  };

  const freqLabel = (t) =>
    t.schedule_freq === 'daily'
      ? 'every day'
      : t.schedule_freq === 'weekly'
        ? `every ${DOW.find((d) => d.v === Number(t.schedule_dow))?.label ?? '—'}`
        : 'no schedule';

  if (!area) return <div className="empty">Loading area…</div>;

  return (
    <div>
      <div className="crumbs">
        <Link to="/">← Areas</Link>
      </div>
      <h1>
        {area.icon} <span style={{ color: area.color }}>{area.name}</span>
      </h1>

      <div className="section">
        <h2>Trackers</h2>
        {trackers.length === 0 ? (
          <div className="empty">No trackers yet. Add one below.</div>
        ) : (
          trackers.map((t) => (
            <div
              key={t.id}
              className="tracker-row"
              onClick={() => navigate(`/tracker/${t.id}`)}
            >
              <div>
                <div className="t-name">{t.name}</div>
                <div className="t-meta">
                  {t.unit ? `${t.unit} · ` : ''}
                  {freqLabel(t)}
                </div>
              </div>
              <button className="danger" onClick={(e) => removeTracker(e, t.id)}>
                delete
              </button>
            </div>
          ))
        )}

        <form className="card" onSubmit={addTracker} style={{ marginTop: 12 }}>
          <div className="row">
            <div className="field">
              <label>Tracker name</label>
              <input
                value={tName}
                onChange={(e) => setTName(e.target.value)}
                placeholder="e.g. Weight"
              />
            </div>
            <div className="field">
              <label>Unit</label>
              <input
                value={tUnit}
                onChange={(e) => setTUnit(e.target.value)}
                placeholder="kg"
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Schedule</label>
              <select value={tFreq} onChange={(e) => setTFreq(e.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
                <option value="none">No schedule</option>
              </select>
            </div>
            {tFreq === 'weekly' && (
              <div className="field">
                <label>Day</label>
                <select value={tDow} onChange={(e) => setTDow(e.target.value)}>
                  {DOW.map((d) => (
                    <option key={d.v} value={d.v}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <button type="submit" disabled={!tName.trim()}>
            + Add tracker
          </button>
          {error && <div className="error">{error}</div>}
        </form>
      </div>

      <div className="section">
        <h2>Goals &amp; notes</h2>
        {items.length === 0 ? (
          <div className="empty">No goals or notes yet.</div>
        ) : (
          items.map((it) => (
            <div key={it.id} className={`item-row ${it.status === 'done' ? 'done' : ''}`}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={it.status === 'done'}
                onChange={() => toggleItem(it)}
              />
              <span className="badge">{it.type}</span>
              <span className="item-text">{it.content}</span>
              <button className="danger" onClick={() => removeItem(it.id)}>
                delete
              </button>
            </div>
          ))
        )}
        <form className="row" onSubmit={addItem} style={{ marginTop: 12 }}>
          <select value={iType} onChange={(e) => setIType(e.target.value)} style={{ flex: '0 0 120px' }}>
            <option value="goal">Goal</option>
            <option value="task">Task</option>
            <option value="note">Note</option>
          </select>
          <input
            value={iContent}
            onChange={(e) => setIContent(e.target.value)}
            placeholder="Add a goal, task, or note…"
          />
          <button type="submit" disabled={!iContent.trim()} style={{ flex: '0 0 auto' }}>
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
