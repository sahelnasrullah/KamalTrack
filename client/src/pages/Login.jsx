import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login, signup, requestReset, confirmReset } = useAuth();
  const [mode, setMode] = useState('login'); // login | signup | reset-request | reset-confirm

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [remember, setRemember] = useState(true);
  const [resetToken, setResetToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const reset = () => {
    setError('');
    setInfo('');
  };

  const submit = async (e) => {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      if (mode === 'login') {
        await login({ email, password, remember });
      } else if (mode === 'signup') {
        await signup({ email, password, name });
      } else if (mode === 'reset-request') {
        const r = await requestReset(email);
        // In dev the backend returns a token so the flow is testable end-to-end.
        if (r.devToken) {
          setResetToken(r.devToken);
          setInfo('Dev mode: reset token filled in below. Set a new password.');
          setMode('reset-confirm');
        } else {
          setInfo('If that email exists, a reset link has been sent.');
        }
      } else if (mode === 'reset-confirm') {
        await confirmReset(resetToken, password);
        setInfo('Password updated. You can log in now.');
        setMode('login');
        setPassword('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const title = {
    login: 'Welcome back',
    signup: 'Create your account',
    'reset-request': 'Reset your password',
    'reset-confirm': 'Set a new password',
  }[mode];

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          Kamal<span>Track</span>
        </div>
        <p className="login-tag">{title}</p>

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
          )}

          {mode !== 'reset-confirm' && (
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
              />
            </div>
          )}

          {mode === 'reset-confirm' && (
            <div className="field">
              <label>Reset token</label>
              <input value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="paste token" />
            </div>
          )}

          {mode !== 'reset-request' && (
            <div className="field">
              <label>{mode === 'reset-confirm' ? 'New password' : 'Password'}</label>
              <div className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'at least 8 characters' : '••••••••'}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  tabIndex={-1}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>
          )}

          {mode === 'login' && (
            <label className="remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me for 30 days
            </label>
          )}

          {error && <div className="error">{error}</div>}
          {info && <div className="import-msg" style={{ marginTop: 8 }}>{info}</div>}

          <button type="submit" disabled={busy} style={{ width: '100%', marginTop: 14 }}>
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Log in'
                : mode === 'signup'
                  ? 'Sign up'
                  : mode === 'reset-request'
                    ? 'Send reset token'
                    : 'Update password'}
          </button>
        </form>

        <div className="login-links">
          {mode === 'login' && (
            <>
              <button className="linkbtn" onClick={() => { reset(); setMode('signup'); }}>
                Create an account
              </button>
              <button className="linkbtn" onClick={() => { reset(); setMode('reset-request'); }}>
                Forgot password?
              </button>
            </>
          )}
          {mode !== 'login' && (
            <button className="linkbtn" onClick={() => { reset(); setMode('login'); }}>
              ← Back to log in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
