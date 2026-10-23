import { useEffect, useState, useCallback } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { api } from './api.js';

/**
 * App shell: brand header + the "due today" reminders banner that appears on
 * every page. The banner is the in-app reminder; if the user grants permission
 * we also fire a one-time browser notification per session.
 */
export default function App() {
  const [due, setDue] = useState([]);
  const [notified, setNotified] = useState(false);

  const loadDue = useCallback(async () => {
    try {
      setDue(await api.dueToday());
    } catch {
      /* backend may be starting; ignore */
    }
  }, []);

  useEffect(() => {
    loadDue();
    // Re-check reminders when the user returns to the tab, and every 5 min.
    const onFocus = () => loadDue();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(loadDue, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [loadDue]);

  // Optional browser notification (only after permission + only once/session).
  useEffect(() => {
    if (due.length === 0 || notified) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      const names = due.map((d) => d.name).join(', ');
      new Notification('KamalTrack — due today', {
        body: `Don't forget to fill in: ${names}`,
      });
      setNotified(true);
    }
  }, [due, notified]);

  const enableNotifications = async () => {
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    setNotified(false); // allow a notification to fire now that it's granted
  };

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link to="/" className="brand">
          Kamal<span>Track</span>
        </Link>
        {'Notification' in window && Notification.permission !== 'granted' && (
          <button className="ghost" onClick={enableNotifications}>
            🔔 Enable reminders
          </button>
        )}
      </div>

      {due.length > 0 && (
        <div className="banner">
          <h3>⏰ Due today — don&apos;t forget to log:</h3>
          <div>
            {due.map((d) => (
              <Link key={d.id} to={`/tracker/${d.id}`} className="due-item">
                {d.area_icon} {d.name}
                {d.unit ? ` (${d.unit})` : ''}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pages can trigger a reminders refresh via this context */}
      <Outlet context={{ refreshDue: loadDue }} />
    </div>
  );
}
