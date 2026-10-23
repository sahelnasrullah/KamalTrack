import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const [name, setName] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (name.trim()) login(name);
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          Kamal<span>Track</span>
        </div>
        <p className="login-tag">Your personal life-OS — track, plan, reflect.</p>

        <form onSubmit={submit}>
          <label htmlFor="name">What should we call you?</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
          />
          <button type="submit" disabled={!name.trim()} style={{ width: '100%', marginTop: 12 }}>
            Continue →
          </button>
        </form>

        <p className="login-note">
          No account or password needed — your name is stored locally on this device just to
          personalize the app.
        </p>
      </div>
    </div>
  );
}
