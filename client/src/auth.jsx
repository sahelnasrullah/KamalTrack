import { createContext, useContext, useEffect, useState, useCallback } from 'react';

/**
 * Real token-based auth against the backend.
 * - token is stored in localStorage (remember me) or sessionStorage (session only)
 * - on load, we validate the token via /api/auth/me
 * The token is attached to every API request by api.js (which reads getToken()).
 */
const AuthContext = createContext(null);

const LS_KEY = 'kamaltrack.token';

// Token accessor shared with api.js (set via module-level store).
let currentToken = null;
export function getToken() {
  if (currentToken) return currentToken;
  return localStorage.getItem(LS_KEY) || sessionStorage.getItem(LS_KEY) || null;
}
function storeToken(token, remember) {
  currentToken = token;
  if (remember) {
    localStorage.setItem(LS_KEY, token);
    sessionStorage.removeItem(LS_KEY);
  } else {
    sessionStorage.setItem(LS_KEY, token);
    localStorage.removeItem(LS_KEY);
  }
}
function clearToken() {
  currentToken = null;
  localStorage.removeItem(LS_KEY);
  sessionStorage.removeItem(LS_KEY);
}

async function apiAuth(path, body) {
  const res = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap: if we have a token, fetch the current user to confirm it's valid.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    currentToken = token;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUser(d.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const signup = useCallback(async ({ email, password, name }) => {
    const { token, user: u } = await apiAuth('signup', { email, password, name });
    storeToken(token, true);
    setUser(u);
  }, []);

  const login = useCallback(async ({ email, password, remember }) => {
    const { token, user: u } = await apiAuth('login', { email, password, remember });
    storeToken(token, remember);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const requestReset = useCallback((email) => apiAuth('reset/request', { email }), []);
  const confirmReset = useCallback(
    (token, password) => apiAuth('reset/confirm', { token, password }),
    [],
  );

  return (
    <AuthContext.Provider
      value={{ user, loading, signup, login, logout, requestReset, confirmReset }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
