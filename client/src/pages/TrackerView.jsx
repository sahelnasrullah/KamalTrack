import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../api.js';

export default function TrackerView() {
  const { trackerId } = useParams();
  const navigate = useNavigate();
  const { refreshDue } = useOutletContext();

  const [tracker, setTracker] = useState(null);
  const [entries, setEntries] = useState([]);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setTracker(await api.getTracker(trackerId));
    setEntries(await api.getEntries(trackerId));
  }, [trackerId]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const addEntry = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      // Optimistic: push the point so the graph updates instantly...
      const optimistic = {
        id: `tmp-${Date.now()}`,
        tracker_id: Number(trackerId),
        value: Number(value),
        date,
        note: '',
      };
      setEntries((prev) =>
        [...prev, optimistic].sort((a, b) => a.date.localeCompare(b.date)),
      );
      setValue('');

      // ...then persist and reconcile with the server's canonical list.
      await api.createEntry(trackerId, { value: optimistic.value, date });
      await load();
      refreshDue?.(); // logging may clear a "due today" reminder
    } catch (err) {
      setError(err.message);
      await load(); // roll back optimistic point on failure
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (id) => {
    await api.deleteEntry(id);
    await load();
    refreshDue?.();
  };

  if (!tracker) return <div className="empty">Loading tracker…</div>;

  const chartData = entries.map((e) => ({
    date: e.date.slice(5), // MM-DD for a compact axis
    value: e.value,
    id: e.id,
  }));

  const latest = entries.length ? entries[entries.length - 1].value : null;
  const first = entries.length ? entries[0].value : null;
  const delta =
    latest != null && first != null
      ? Math.round((latest - first) * 100) / 100
      : null;

  return (
    <div>
      <div className="crumbs">
        <button className="ghost" onClick={() => navigate(-1)} style={{ padding: '4px 10px' }}>
          ← Back
        </button>
      </div>
      <h1>{tracker.name}</h1>
      <p className="muted">
        {tracker.unit ? `Measured in ${tracker.unit}. ` : ''}
        {tracker.schedule_freq === 'weekly'
          ? 'Logged weekly.'
          : tracker.schedule_freq === 'daily'
            ? 'Logged daily.'
            : 'No schedule.'}
      </p>

      {entries.length > 0 && (
        <div className="stat">
          <div>
            <div className="big">
              {latest}
              {tracker.unit ? ` ${tracker.unit}` : ''}
            </div>
            <div className="lbl">latest</div>
          </div>
          {delta != null && entries.length > 1 && (
            <div>
              <div className="big" style={{ color: delta < 0 ? '#10b981' : delta > 0 ? '#f59e0b' : undefined }}>
                {delta > 0 ? '+' : ''}
                {delta}
                {tracker.unit ? ` ${tracker.unit}` : ''}
              </div>
              <div className="lbl">since first entry</div>
            </div>
          )}
          <div>
            <div className="big">{entries.length}</div>
            <div className="lbl">entries</div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Progress graph</h2>
        {chartData.length === 0 ? (
          <div className="empty">No entries yet — add one below and watch the graph appear.</div>
        ) : (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d313c" />
                <XAxis dataKey="date" stroke="#9aa1ad" fontSize={12} />
                <YAxis stroke="#9aa1ad" fontSize={12} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{
                    background: '#1a1d27',
                    border: '1px solid #2d313c',
                    borderRadius: 8,
                    color: '#e6e8ec',
                  }}
                  formatter={(v) => [`${v}${tracker.unit ? ` ${tracker.unit}` : ''}`, tracker.name]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#6366f1' }}
                  activeDot={{ r: 6 }}
                  isAnimationActive
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="section">
        <form className="card" onSubmit={addEntry}>
          <h2>Log a new entry</h2>
          <div className="row">
            <div className="field">
              <label>Value{tracker.unit ? ` (${tracker.unit})` : ''}</label>
              <input
                type="number"
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 81.5"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <button type="submit" disabled={saving || value === ''}>
            {saving ? 'Saving…' : 'Add entry'}
          </button>
          {error && <div className="error">{error}</div>}
        </form>
      </div>

      {entries.length > 0 && (
        <div className="section">
          <h2>History</h2>
          {[...entries].reverse().map((e) => (
            <div key={e.id} className="item-row">
              <span className="item-text">
                {e.date}: <strong>{e.value}</strong>
                {tracker.unit ? ` ${tracker.unit}` : ''}
              </span>
              {typeof e.id === 'number' && (
                <button className="danger" onClick={() => removeEntry(e.id)}>
                  delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
