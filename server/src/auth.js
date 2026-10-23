import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

// JWT secret must come from the environment in production. A dev fallback keeps
// local runs working, but we warn loudly if it's used.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set — using an insecure dev secret. Set JWT_SECRET in production.');
}

// Token lifetimes: normal session vs "remember me".
const EXPIRY_DEFAULT = '12h';
const EXPIRY_REMEMBER = '30d';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export function signToken(user, remember = false) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: remember ? EXPIRY_REMEMBER : EXPIRY_DEFAULT },
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Express middleware: require a valid Bearer token; attaches req.user = { id, email }.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'authentication required' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'invalid or expired token' });
  req.user = { id: payload.sub, email: payload.email };
  next();
}

// Password reset tokens: we store only a hash of the token, return the raw
// token to the caller (to be emailed later — email delivery is a separate seam).
export function generateResetToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashResetToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
