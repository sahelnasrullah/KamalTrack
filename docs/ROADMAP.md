# KamalTrack — Future Features / Roadmap notes

Tracking planned work that is intentionally deferred.

## Deferred, requested by owner
1. **Login with Google (OAuth)** — in addition to email/password auth.
   The auth layer is being built so an OAuth provider can slot in cleanly
   (users table already supports external identities; add a provider column
   + OAuth callback route when implementing).

2. **Password reset via email** — the token-based reset *mechanism* is built
   (reset tokens with expiry), but actually SENDING the email requires a
   free email/SMTP provider (e.g. Resend or SendGrid free tier). This is left
   as a clear seam: the backend generates the token; wire an email sender to
   deliver it. Until then, reset is mechanism-only.

## Current direction
- Email/password auth with "remember me" (longer-lived JWT).
- Multi-user with full per-user data isolation (every table scoped by user_id).
- Postgres (migrated from SQLite).
- Free online hosting (targeting Render: free web service + free Postgres).
