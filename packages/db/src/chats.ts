import { jstNow } from './utils.js';
// オペレーター＆チャット管理クエリヘルパー

export interface OperatorRow {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ChatRow {
  id: string;
  friend_id: string;
  operator_id: string | null;
  status: string;
  notes: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- オペレーター ---

export async function getOperators(db: D1Database): Promise<OperatorRow[]> {
  const result = await db.prepare(`SELECT * FROM operators ORDER BY created_at DESC`).all<OperatorRow>();
  return result.results;
}

export async function getOperatorById(db: D1Database, id: string): Promise<OperatorRow | null> {
  return db.prepare(`SELECT * FROM operators WHERE id = ?`).bind(id).first<OperatorRow>();
}

export async function createOperator(
  db: D1Database,
  input: { name: string; email: string; role?: string },
): Promise<OperatorRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db.prepare(`INSERT INTO operators (id, name, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, input.name, input.email, input.role ?? 'operator', now, now).run();
  return (await getOperatorById(db, id))!;
}

export async function updateOperator(
  db: D1Database,
  id: string,
  updates: Partial<{ name: string; email: string; role: string; isActive: boolean }>,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
  if (updates.email !== undefined) { sets.push('email = ?'); values.push(updates.email); }
  if (updates.role !== undefined) { sets.push('role = ?'); values.push(updates.role); }
  if (updates.isActive !== undefined) { sets.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  values.push(jstNow());
  values.push(id);
  await db.prepare(`UPDATE operators SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteOperator(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM operators WHERE id = ?`).bind(id).run();
}

// --- チャット ---

export async function getChats(db: D1Database, opts: { status?: string; operatorId?: string } = {}): Promise<ChatRow[]> {
  if (opts.status && opts.operatorId) {
    const result = await db.prepare(`SELECT * FROM chats WHERE status = ? AND operator_id = ? ORDER BY last_message_at DESC`)
      .bind(opts.status, opts.operatorId).all<ChatRow>();
    return result.results;
  }
  if (opts.status) {
    const result = await db.prepare(`SELECT * FROM chats WHERE status = ? ORDER BY last_message_at DESC`)
      .bind(opts.status).all<ChatRow>();
    return result.results;
  }
  if (opts.operatorId) {
    const result = await db.prepare(`SELECT * FROM chats WHERE operator_id = ? ORDER BY last_message_at DESC`)
      .bind(opts.operatorId).all<ChatRow>();
    return result.results;
  }
  const result = await db.prepare(`SELECT * FROM chats ORDER BY last_message_at DESC`).all<ChatRow>();
  return result.results;
}

export async function getChatById(db: D1Database, id: string): Promise<ChatRow | null> {
  return db.prepare(`SELECT * FROM chats WHERE id = ?`).bind(id).first<ChatRow>();
}

export async function getChatByFriendId(db: D1Database, friendId: string): Promise<ChatRow | null> {
  return consolidateChatsForFriend(db, friendId);
}

/**
 * 同一 friend に chats 行が複数あると、保存先と表示先がずれる。
 * 1行に統合し、オペレーター更新 (status/notes) を優先してマージする。
 */
const CHAT_STATUS_PRIORITY: Record<string, number> = {
  in_progress: 3,
  unread: 2,
  resolved: 1,
};

function pickMergedChatFields(rows: ChatRow[]): {
  status: string;
  notes: string | null;
  operatorId: string | null;
} {
  const byUpdated = [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  let status = byUpdated[0]?.status ?? 'resolved';
  let statusPriority = CHAT_STATUS_PRIORITY[status] ?? 0;
  for (const row of rows) {
    const p = CHAT_STATUS_PRIORITY[row.status] ?? 0;
    if (p > statusPriority) {
      status = row.status;
      statusPriority = p;
    }
  }

  let notes: string | null = null;
  for (const row of byUpdated) {
    if (row.notes != null && row.notes !== '') {
      notes = row.notes;
      break;
    }
  }

  let operatorId: string | null = null;
  for (const row of byUpdated) {
    if (row.operator_id) {
      operatorId = row.operator_id;
      break;
    }
  }

  return { status, notes, operatorId };
}

export async function consolidateChatsForFriend(db: D1Database, friendId: string): Promise<ChatRow | null> {
  const { results } = await db
    .prepare(`SELECT * FROM chats WHERE friend_id = ? ORDER BY updated_at DESC, created_at DESC`)
    .bind(friendId)
    .all<ChatRow>();

  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  const canonical = results[0];
  const merged = pickMergedChatFields(results);

  for (const row of results.slice(1)) {
    await db.prepare(`DELETE FROM chats WHERE id = ?`).bind(row.id).run();
  }

  const needsUpdate =
    merged.status !== canonical.status ||
    merged.notes !== canonical.notes ||
    merged.operatorId !== canonical.operator_id;

  if (needsUpdate) {
    await updateChat(db, canonical.id, {
      status: merged.status,
      notes: merged.notes ?? '',
      operatorId: merged.operatorId,
    });
    return (await getChatById(db, canonical.id))!;
  }

  return canonical;
}

export async function createChat(
  db: D1Database,
  input: { friendId: string; operatorId?: string; status?: string },
): Promise<ChatRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  const status = input.status ?? 'unread';
  await db.prepare(
    `INSERT INTO chats (id, friend_id, operator_id, status, last_message_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, input.friendId, input.operatorId ?? null, status, now, now, now).run();
  return (await getChatById(db, id))!;
}

export async function updateChat(
  db: D1Database,
  id: string,
  updates: Partial<{ operatorId: string | null; status: string; notes: string; lastMessageAt: string }>,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (updates.operatorId !== undefined) { sets.push('operator_id = ?'); values.push(updates.operatorId); }
  if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status); }
  if (updates.notes !== undefined) { sets.push('notes = ?'); values.push(updates.notes); }
  if (updates.lastMessageAt !== undefined) { sets.push('last_message_at = ?'); values.push(updates.lastMessageAt); }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  values.push(jstNow());
  values.push(id);
  await db.prepare(`UPDATE chats SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
}

/** 友だちからメッセージ受信時にチャットを作成/更新 */
export async function upsertChatOnMessage(db: D1Database, friendId: string): Promise<ChatRow> {
  const existing = await getChatByFriendId(db, friendId);
  const now = jstNow();
  if (existing) {
    // resolvedだった場合はunreadに戻す
    const newStatus = existing.status === 'resolved' ? 'unread' : existing.status;
    await updateChat(db, existing.id, { status: newStatus, lastMessageAt: now });
    return (await getChatById(db, existing.id))!;
  }
  return createChat(db, { friendId });
}
