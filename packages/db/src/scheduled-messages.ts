import { jstNow } from './utils.js';

export type ScheduledMessageStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
export type ScheduledMessageType = 'text' | 'image' | 'flex' | 'file';

export interface ScheduledMessageRow {
  id: string;
  friend_id: string;
  chat_id: string | null;
  message_type: ScheduledMessageType;
  message_content: string;
  alt_text: string | null;
  scheduled_at: string;
  status: ScheduledMessageStatus;
  sent_at: string | null;
  error_message: string | null;
  line_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduledMessageInput {
  friendId: string;
  chatId?: string | null;
  messageType: ScheduledMessageType;
  messageContent: string;
  altText?: string | null;
  scheduledAt: string;
  lineAccountId?: string | null;
}

/** datetime-local 等を JST ISO に正規化 */
export function normalizeScheduledAtInput(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00.000+09:00`;
  }
  return trimmed;
}

export function parseScheduledAtMs(value: string): number {
  const ms = Date.parse(normalizeScheduledAtInput(value));
  return Number.isFinite(ms) ? ms : NaN;
}

export async function createScheduledMessage(
  db: D1Database,
  input: CreateScheduledMessageInput,
): Promise<ScheduledMessageRow> {
  const now = jstNow();
  const id = crypto.randomUUID();
  const scheduledAt = normalizeScheduledAtInput(input.scheduledAt);

  await db
    .prepare(
      `INSERT INTO scheduled_messages
       (id, friend_id, chat_id, message_type, message_content, alt_text, scheduled_at, status, line_account_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    )
    .bind(
      id,
      input.friendId,
      input.chatId ?? null,
      input.messageType,
      input.messageContent,
      input.altText ?? null,
      scheduledAt,
      input.lineAccountId ?? null,
      now,
      now,
    )
    .run();

  const row = await getScheduledMessageById(db, id);
  if (!row) throw new Error('Failed to create scheduled message');
  return row;
}

export async function getScheduledMessageById(
  db: D1Database,
  id: string,
): Promise<ScheduledMessageRow | null> {
  return db.prepare(`SELECT * FROM scheduled_messages WHERE id = ?`).bind(id).first<ScheduledMessageRow>();
}

export async function getPendingScheduledMessagesForFriend(
  db: D1Database,
  friendId: string,
): Promise<ScheduledMessageRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM scheduled_messages
       WHERE friend_id = ? AND status = 'pending'
       ORDER BY scheduled_at ASC`,
    )
    .bind(friendId)
    .all<ScheduledMessageRow>();
  return result.results;
}

export async function getDueScheduledMessages(
  db: D1Database,
  nowIso: string,
): Promise<ScheduledMessageRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM scheduled_messages
       WHERE status = 'pending' AND scheduled_at <= ?
       ORDER BY scheduled_at ASC
       LIMIT 50`,
    )
    .bind(nowIso)
    .all<ScheduledMessageRow>();
  return result.results;
}

export async function claimScheduledMessage(db: D1Database, id: string): Promise<boolean> {
  const now = jstNow();
  const result = await db
    .prepare(
      `UPDATE scheduled_messages SET status = 'sending', updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(now, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function markScheduledMessageSent(db: D1Database, id: string): Promise<void> {
  const now = jstNow();
  await db
    .prepare(
      `UPDATE scheduled_messages SET status = 'sent', sent_at = ?, updated_at = ?, error_message = NULL
       WHERE id = ?`,
    )
    .bind(now, now, id)
    .run();
}

export async function markScheduledMessageFailed(
  db: D1Database,
  id: string,
  errorMessage: string,
): Promise<void> {
  const now = jstNow();
  await db
    .prepare(
      `UPDATE scheduled_messages SET status = 'failed', error_message = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(errorMessage.slice(0, 500), now, id)
    .run();
}

export async function resetScheduledMessageToPending(db: D1Database, id: string): Promise<void> {
  const now = jstNow();
  await db
    .prepare(
      `UPDATE scheduled_messages SET status = 'pending', updated_at = ?
       WHERE id = ? AND status = 'sending'`,
    )
    .bind(now, id)
    .run();
}

export async function cancelScheduledMessage(db: D1Database, id: string): Promise<boolean> {
  const now = jstNow();
  const result = await db
    .prepare(
      `UPDATE scheduled_messages SET status = 'cancelled', updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(now, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
