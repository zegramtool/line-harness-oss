/**
 * 未対応インボックスを一括クリアする。
 * - 対象 friend に inbox_ack（チャット非表示）を挿入
 * - chats.status を resolved に更新
 *
 * Usage:
 *   pnpm tacteq:clear-unanswered --dry-run
 *   pnpm tacteq:clear-unanswered
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { d1ExecuteFile, d1Query, jstNow, sqlString } from './lib.ts';

const ACK_SOURCE = 'inbox_ack';

const CANDIDATES_SQL = `
WITH agg AS (
  SELECT
    friend_id,
    MAX(CASE WHEN direction='incoming' AND (source IS NULL OR (source != 'postback' AND source != 'csv_import')) THEN created_at END) AS last_incoming,
    MAX(CASE WHEN direction='outgoing' AND source IN ('manual', 'inbox_ack') THEN created_at END) AS last_manual
  FROM messages_log
  GROUP BY friend_id
)
SELECT f.id AS friend_id, f.line_account_id, agg.last_incoming
FROM friends f
JOIN agg ON agg.friend_id = f.id
LEFT JOIN line_accounts la ON la.id = f.line_account_id
WHERE f.is_following = 1
  AND (la.id IS NULL OR la.is_active = 1)
  AND agg.last_incoming IS NOT NULL
  AND (agg.last_manual IS NULL OR agg.last_manual < agg.last_incoming)
`;

function ackTimestampAfter(iso: string): string {
  const ms = new Date(iso).getTime() + 1000;
  const jst = new Date(ms + 9 * 60 * 60_000);
  return `${jst.toISOString().slice(0, -1)}+09:00`;
}

function ackMessageId(friendId: string, at: string): string {
  return createHash('sha256').update(`${friendId}:${at}:${ACK_SOURCE}`).digest('hex').slice(0, 32);
}

function parseArgs(): { dryRun: boolean } {
  return { dryRun: process.argv.includes('--dry-run') };
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();
  const candidates = await d1Query<{
    friend_id: string;
    line_account_id: string | null;
    last_incoming: string;
  }>(CANDIDATES_SQL);

  console.log(`Unanswered candidates (pre auto-reply filter): ${candidates.length}`);

  const statusRows = await d1Query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM chats WHERE status IN ('unread', 'in_progress')`,
  );
  const openChats = statusRows[0]?.cnt ?? 0;
  console.log(`Chats with unread/in_progress: ${openChats}`);

  if (candidates.length === 0 && openChats === 0) {
    console.log('Nothing to clear.');
    return;
  }

  if (dryRun) {
    console.log('Dry run — no writes.');
    return;
  }

  const now = jstNow();
  const statements: string[] = [];

  for (const row of candidates) {
    const at = ackTimestampAfter(row.last_incoming);
    const id = ackMessageId(row.friend_id, at);
    const account = row.line_account_id ? sqlString(row.line_account_id) : 'NULL';
    statements.push(
      `INSERT OR IGNORE INTO messages_log (id, friend_id, direction, message_type, content, source, line_account_id, created_at) VALUES (${sqlString(id)}, ${sqlString(row.friend_id)}, 'outgoing', 'text', '', ${sqlString(ACK_SOURCE)}, ${account}, ${sqlString(at)});`,
    );
  }

  statements.push(
    `UPDATE chats SET status = 'resolved', updated_at = ${sqlString(now)} WHERE status IN ('unread', 'in_progress');`,
  );

  const path = join(tmpdir(), `tacteq-clear-unanswered-${Date.now()}.sql`);
  writeFileSync(path, statements.join('\n'));
  console.log(`Applying ${candidates.length} inbox_ack row(s) + chat status update...`);
  await d1ExecuteFile(path);
  console.log('Done. 未対応バッジが 0 になるか管理画面で確認してください。');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
