import { useEffect, useState, useCallback } from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';

/**
 * App shell: login gate (option A) + responsive sidebar.
 * - Not "logged in" (no local name) -> Login screen.
 * - Logged in -> sidebar nav (Dashboard, Daily Habits, Schedule) + page outlet.
 * The "due today" reminders banner shows on every page.
 */
export default function App() {
  const { user, logout } = useAuth();
  const [due, setDue] = useState([]);
  const [notified, setNotified] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadDue = useCallback(async () => {
    try {
      setDue(await api.dueToday());
    } catch {
      /* backend may be starting; ignore */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadDue();
    const onFocus = () => loadDue();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(loadDue, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [user, loadDue]);

  useEffect(() => {
    if (due.length === 0 || notified || !user) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification('KamalTrack — due today', {
        body: `Don't forget to fill in: ${due.map((d) => d.name).join(', ')}`,
      });
      setNotified(true);
    }
  }, [due, notified, user]);

  const enableNotifications = async () => {
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    setNotified(false);
  };

  if (!user) return <Login />;

  const navItems = [
    { to: '/', label: 'Dashboard', icon: '🏠', end: true },
    { to: '/habits', label: 'Daily Habits', icon: '✅' },
    { to: '/schedule', label: 'Schedule', icon: '📅' },
  ];

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <Link to="/" className="brand" onClick={() => setSidebarOpen(false)}>
          Kamal<span>Track</span>
        </Link>

        <nav className="side-nav">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="side-ico">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="side-footer">
          <div className="side-user">👤 {user.name}</div>
          <button className="ghost" onClick={logout} style={{ width: '100%' }}>
            Log out
          </button>
        </div>
      </aside>

      {/* Mobile overlay when sidebar open */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      {/* Main column */}
      <div className="main">
        <header className="mobile-bar">
          <button className="ghost hamburger" onClick={() => setSidebarOpen((s) => !s)}>
            ☰
          </button>
          <Link to="/" className="brand small">
            Kamal<span>Track</span>
          </Link>
        </header>

        <div className="content">
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

          {'Notification' in window && Notification.permission !== 'granted' && (
            <div style={{ marginBottom: 16 }}>
              <button className="ghost" onClick={enableNotifications}>
                🔔 Enable reminders
              </button>
            </div>
          )}

          <Outlet context={{ refreshDue: loadDue }} />
        </div>
      </div>
    </div>
  );
}
