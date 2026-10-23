# KamalTrack

A personal life-tracking web app. Organize life into **areas** (Health, Career, Learning, ...), create **trackers** inside them (e.g. Weight, kg, logged every Monday), log entries and watch a **graph update live**, get **due-today reminders**, and request an **AI weekly reflection** that reads your data and suggests next steps.

Built as a portfolio project: _"I built a personal life-OS where AI turns scattered tracking into planning and reflection."_

## Tech stack

- **Frontend:** React + Vite, Recharts for graphs
- **Backend:** Node.js + Express, SQLite (better-sqlite3)
- **AI:** Swappable provider abstraction. Ships with a free **Gemini** provider and a **mock** fallback (works with no API key). Swapping to OpenAI/Anthropic later is a config change.

## Project structure

```
kamaltrack/
├── client/          # React + Vite frontend
├── server/          # Node + Express API + SQLite
│   ├── src/
│   │   ├── ai/      # swappable AI provider abstraction
│   │   ├── db.js    # SQLite schema + connection
│   │   └── index.js # Express app + routes
│   └── data/        # SQLite file lives here (gitignored)
└── README.md
```

## Getting started

Requires Node.js 18+ (tested on Node 22).

### 1. Backend

```bash
cd server
npm install
cp .env.example .env     # optional: add GEMINI_API_KEY to enable real AI
npm run dev              # starts API on http://localhost:3001
```

### 2. Frontend

```bash
cd client
npm install
npm run dev              # starts app on http://localhost:5173
```

Open http://localhost:5173.

## AI configuration

The AI layer is swappable via environment variables in `server/.env`:

```
AI_PROVIDER=mock          # mock | gemini
GEMINI_API_KEY=           # required only when AI_PROVIDER=gemini
```

- `mock` (default): works offline, no key, returns a templated reflection from your real data. Great for development and demos.
- `gemini`: uses Google's free Gemini API. Get a key at https://aistudio.google.com/apikey.

To add a new provider (e.g. OpenAI), implement the `AIProvider` interface in `server/src/ai/` and register it in `server/src/ai/index.js`. No other code changes needed.

## Update workflow (keeping it maintained)

This project is designed to be iterated on over time:

```bash
# make changes, then:
git add -A
git commit -m "feat: describe what you changed"
git push

# pull latest if working from another machine:
git pull
```

Suggested commit prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.

## Roadmap

- [ ] True scheduled push notifications (Web Push + service worker)
- [ ] More tracker types (scale, boolean, streaks)
- [ ] Natural-language capture ("ran 5k and studied 2h" → auto-filed)
- [ ] Goal → plan generation via AI
- [ ] Multi-user accounts + auth
- [ ] Deploy (Postgres swap-in for SQLite)

## License

MIT
