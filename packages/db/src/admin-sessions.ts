import { jstNow, toJstString } from './utils.js';

export const ADMIN_SESSION_TOKEN_PREFIX = 'lh_sess_';

/** 7 days — matches HttpOnly session cookie Max-Age. */
export const ADMIN_SESSION_TTL_SEC = 604800;

export interface AdminSessionRow {
  token: string;
  staff_id: string;
  expires_at: string;
  created_at: string;
}

export function isAdminSessionToken(token: string): boolean {
  return token.startsWith(ADMIN_SESSION_TOKEN_PREFIX);
}

function generateSessionToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${ADMIN_SESSION_TOKEN_PREFIX}${hex}`;
}

export async function createAdminSession(
  db: D1Database,
  staffId: string,
  ttlSec: number = ADMIN_SESSION_TTL_SEC,
): Promise<string> {
  const token = generateSessionToken();
  const now = jstNow();
  const expiresAt = toJstString(new Date(Date.now() + ttlSec * 1000));
  await db
    .prepare(
      `INSERT INTO admin_sessions (token, staff_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
    )
    .bind(token, staffId, expiresAt, now)
    .run();
  return token;
}

export async function getAdminSession(
  db: D1Database,
  token: string,
): Promise<AdminSessionRow | null> {
  if (!isAdminSessionToken(token)) return null;
  const row = await db
    .prepare(`SELECT * FROM admin_sessions WHERE token = ?`)
    .bind(token)
    .first<AdminSessionRow>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await revokeAdminSession(db, token);
    return null;
  }
  return row;
}

export async function revokeAdminSession(db: D1Database, token: string): Promise<void> {
  await db.prepare(`DELETE FROM admin_sessions WHERE token = ?`).bind(token).run();
}

export async function revokeAdminSessionsForStaff(db: D1Database, staffId: string): Promise<void> {
  await db.prepare(`DELETE FROM admin_sessions WHERE staff_id = ?`).bind(staffId).run();
}

/** Best-effort cleanup; safe to call on login. */
export async function purgeExpiredAdminSessions(db: D1Database): Promise<void> {
  await db.prepare(`DELETE FROM admin_sessions WHERE expires_at < ?`).bind(jstNow()).run();
}
