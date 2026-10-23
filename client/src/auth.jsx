import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Local-only "auth" (option A): there are no real accounts or passwords.
 * We just store a display name in localStorage to gate the UI and personalize
 * it. This is a presentation layer only — swap for real auth before any
 * public/multi-user deployment.
 */
const KEY = 'kamaltrack.user';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  }, [user]);

  const login = (name) => setUser({ name: name.trim(), since: Date.now() });
  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
