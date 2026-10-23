# KamalTrack

A personal life-tracking web app with **multi-user accounts**. Sign up, then organize life into **areas** (Health, Career, Learning, ...), create **trackers** with **live-updating graphs**, keep **daily habits** (with an Excel-style history grid), manage a **Schedule** (calendar + .ics import), get **due-today reminders**, and request an **AI weekly reflection** that reads your data and suggests next steps.

Each user's data is fully isolated — everything is scoped to the logged-in account.

Built as a portfolio project: _"I built a personal life-OS where AI turns scattered tracking into planning and reflection."_

## Tech stack

- **Frontend:** React + Vite, Recharts for graphs, React Router
- **Backend:** Node.js + Express, **PostgreSQL** (`pg`)
- **Auth:** email/password with **bcrypt** hashing + **JWT** tokens (remember-me), token-based password reset. Structured so Google OAuth can be added later.
- **AI:** Swappable provider abstraction — ships with a free **Gemini** provider and a **mock** fallback (works with no API key).

## Project structure

```
kamaltrack/
├── client/              # React + Vite frontend
│   └── src/
│       ├── auth.jsx     # token auth context
│       ├── api.js       # fetch wrapper (attaches Bearer token)
│       └── pages/       # Dashboard, AreaView, TrackerView, Habits, Schedule, Login
├── server/              # Node + Express API + Postgres
│   └── src/
│       ├── ai/          # swappable AI provider abstraction
│       ├── db.js        # Postgres pool + schema (users + per-user tables)
│       ├── auth.js      # hashing, JWT, middleware, reset tokens
│       └── index.js     # Express app + routes (all scoped by user_id)
├── docs/ROADMAP.md      # deferred features (Google OAuth, reset-email seam)
└── README.md
```

## Getting started (local)

Requires Node.js 18+ (tested on Node 22) and a PostgreSQL database.

### 1. Start Postgres

Easiest is Docker:

```bash
docker run -d --name kamaltrack-pg \
  -e POSTGRES_PASSWORD=devpass -e POSTGRES_USER=kamal -e POSTGRES_DB=kamaltrack \
  -p 5432:5432 postgres:16-alpine
```

(Or use any local/remote Postgres and point `DATABASE_URL` at it.)

### 2. Backend

```bash
cd server
npm install
cp .env.example .env     # then edit .env (see below)
npm run dev              # starts API on http://localhost:3001 (auto-creates tables)
```

Minimum `.env`:

```
DATABASE_URL=postgres://kamal:devpass@localhost:5432/kamaltrack
JWT_SECRET=<generate one: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
AI_PROVIDER=mock
PORT=3001
```

### 3. Frontend

```bash
cd client
npm install
npm run dev              # starts app on http://localhost:5173
```

Open http://localhost:5173, create an account, and you're in.

## Environment variables (server)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | yes (prod) | Signs auth tokens. Generate a long random value. |
| `PGSSL` | no | Set `true` if your managed Postgres needs SSL but the URL doesn't say so |
| `AI_PROVIDER` | no | `mock` (default) or `gemini` |
| `GEMINI_API_KEY` | only for gemini | Free key: https://aistudio.google.com/apikey |
| `NODE_ENV` | no | Set `production` in prod (hides the dev password-reset token from API responses) |
| `PORT` | no | Defaults to 3001 |

## Auth notes

- **Signup/login** with email + password (min 8 chars), bcrypt-hashed.
- **Remember me** issues a 30-day token (stored in `localStorage`); otherwise a 12-hour session token (`sessionStorage`).
- **Password reset** is token-based (1-hour expiry, single-use). The backend generates the token; **sending it by email is a deferred seam** — in non-production the token is returned in the API response so the flow is testable. See `docs/ROADMAP.md`.
- Every API route (except health + auth) requires a valid Bearer token, and every query is scoped to the authenticated user.

## AI configuration

```
AI_PROVIDER=mock          # mock | gemini
GEMINI_API_KEY=           # required only when AI_PROVIDER=gemini
```

- `mock` (default): works offline, no key, returns a reflection built from your real data (trackers, habits, schedule).
- `gemini`: uses Google's free Gemini API.

To add a provider (e.g. OpenAI), implement the `AIProvider` interface in `server/src/ai/` and register it in `server/src/ai/index.js`.

## Update workflow

```bash
git add -A
git commit -m "feat: describe what you changed"
git push
```

Suggested commit prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.

## Roadmap

See `docs/ROADMAP.md`. Highlights:
- [ ] Login with Google (OAuth)
- [ ] Wire the password-reset email sender (free SMTP/email provider)
- [ ] Recurring (.ics RRULE) event import
- [ ] Deploy online (Render free web service + free Postgres)

## License

MIT
