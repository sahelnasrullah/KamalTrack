import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ReflectionPanel from '../components/ReflectionPanel.jsx';

const ICONS = ['💪', '💼', '📚', '💰', '❤️', '🧠', '🏃', '🎯', '🎨', '🌱'];
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];

export default function Dashboard() {
  const [areas, setAreas] = useState([]);
  const [trackerCounts, setTrackerCounts] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState('');

  const load = async () => {
    const data = await api.getAreas();
    setAreas(data);
    // fetch tracker counts for a small meta label
    const counts = {};
    await Promise.all(
      data.map(async (a) => {
        const t = await api.getTrackers(a.id);
        counts[a.id] = t.length;
      }),
    );
    setTrackerCounts(counts);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createArea({ name, icon, color });
      setName('');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1>Your life areas</h1>
      <p className="muted">
        Organize life into chapters, track what matters, and let AI reflect on your week.
      </p>

      <div className="section">
        <div className="topbar">
          <h2>Areas</h2>
          <button onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ New area'}
          </button>
        </div>

        {showForm && (
          <form className="card" onSubmit={submit} style={{ marginBottom: 16 }}>
            <div className="field">
              <label>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Health, Career, Learning"
                autoFocus
              />
            </div>
            <div className="row">
              <div className="field">
                <label>Icon</label>
                <select value={icon} onChange={(e) => setIcon(e.target.value)}>
                  {ICONS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Color</label>
                <select value={color} onChange={(e) => setColor(e.target.value)}>
                  {COLORS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" disabled={!name.trim()}>
              Create area
            </button>
            {error && <div className="error">{error}</div>}
          </form>
        )}

        {areas.length === 0 ? (
          <div className="empty">No areas yet. Create your first life area above.</div>
        ) : (
          <div className="grid cols-2">
            {areas.map((a) => (
              <Link key={a.id} to={`/area/${a.id}`} className="card area-card">
                <div className="icon">{a.icon}</div>
                <h3 style={{ color: a.color }}>{a.name}</h3>
                <div className="meta">
                  {trackerCounts[a.id] ?? 0} tracker
                  {trackerCounts[a.id] === 1 ? '' : 's'}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <h2>AI weekly reflection</h2>
        <ReflectionPanel />
      </div>
    </div>
  );
}
