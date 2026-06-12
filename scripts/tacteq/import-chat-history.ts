/**
 * Import LINE Official Account Manager chat history CSV into messages_log + chats.
 *
 * LINE Chat Pro exports a ZIP of per-customer CSV files. This script accepts:
 *   --file path/to/messages.csv
 *   --dir  path/to/extracted-zip-folder  (imports all *.csv recursively)
 *
 * Usage:
 *   pnpm tacteq:import-chat --dir ~/Downloads/chat-backup --dry-run
 *
 * CSV columns are auto-detected (Japanese / English headers). Run with --inspect
 * on one file to print detected columns before importing.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { d1ExecuteFile, d1Query, sqlString, jstNow, loadHarnessConfig } from './lib.ts';

interface ParsedMessage {
  lineUserId: string | null;
  displayName: string | null;
  direction: 'incoming' | 'outgoing';
  messageType: string;
  content: string;
  createdAt: string;
}

const DATETIME_KEYS = ['送信日時', '日時', 'timestamp', 'datetime', 'sent_at', 'date'];
const MESSAGE_KEYS = ['メッセージ', '内容', 'message', 'text', 'body', 'コンテンツ'];
const SENDER_KEYS = ['送信者', 'sender', 'from', 'direction', '種別'];
const USER_ID_KEYS = ['ユーザーid', 'user id', 'userid', 'line user id', 'line_user_id'];
const NAME_KEYS = ['表示名', '名前', 'display name', 'name', 'ユーザー名'];

function parseArgs(): {
  file?: string;
  dir?: string;
  dryRun: boolean;
  inspect: boolean;
} {
  const args = process.argv.slice(2);
  let file: string | undefined;
  let dir: string | undefined;
  let dryRun = false;
  let inspect = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--file' && args[i + 1]) {
      file = args[i + 1];
      i += 1;
    } else if (args[i] === '--dir' && args[i + 1]) {
      dir = args[i + 1];
      i += 1;
    } else if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--inspect') inspect = true;
  }
  return { file, dir, dryRun, inspect };
}

function collectCsvFiles(path: string): string[] {
  const st = statSync(path);
  if (st.isFile() && path.toLowerCase().endsWith('.csv')) return [path];
  const out: string[] = [];
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...collectCsvFiles(full));
    else if (entry.toLowerCase().endsWith('.csv')) out.push(full);
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function pickColumn(headers: string[], keys: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const key of keys) {
    const idx = lower.indexOf(key.toLowerCase());
    if (idx >= 0) return idx;
  }
  for (let i = 0; i < lower.length; i += 1) {
    if (keys.some((k) => lower[i].includes(k.toLowerCase()))) return i;
  }
  return -1;
}

function parseDatetime(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const normalized = s.replace(/\//g, '-').replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  const jst = new Date(d.getTime() + 9 * 60 * 60_000);
  return `${jst.toISOString().slice(0, -1)}+09:00`;
}

function inferDirection(senderCell: string): 'incoming' | 'outgoing' {
  const s = senderCell.toLowerCase();
  if (
    s.includes('user') ||
    s.includes('友だち') ||
    s.includes('ユーザー') ||
    s.includes('incoming') ||
    s.includes('受信')
  ) {
    return 'incoming';
  }
  return 'outgoing';
}

function userIdFromFilename(filePath: string): string | null {
  const name = basename(filePath, '.csv');
  const match = name.match(/U[0-9a-f]{32}/i);
  return match ? match[0] : null;
}

function parseCsvFile(filePath: string, inspect: boolean): ParsedMessage[] {
  const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  if (inspect) {
    console.log(`\n--- ${filePath} ---`);
    console.log('Headers:', headers);
  }

  const dtCol = pickColumn(headers, DATETIME_KEYS);
  const msgCol = pickColumn(headers, MESSAGE_KEYS);
  const senderCol = pickColumn(headers, SENDER_KEYS);
  const uidCol = pickColumn(headers, USER_ID_KEYS);
  const nameCol = pickColumn(headers, NAME_KEYS);

  if (inspect) {
    console.log({ dtCol, msgCol, senderCol, uidCol, nameCol });
    return [];
  }

  if (dtCol < 0 || msgCol < 0) {
    throw new Error(
      `${filePath}: could not detect datetime/message columns. Run with --inspect.`,
    );
  }

  const fileUserId = userIdFromFilename(filePath);
  const messages: ParsedMessage[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const content = cells[msgCol]?.trim();
    if (!content) continue;
    const createdAt = parseDatetime(cells[dtCol] ?? '');
    if (!createdAt) continue;

    const lineUserId =
      (uidCol >= 0 ? cells[uidCol]?.trim() : null) ||
      fileUserId ||
      null;
    const displayName = nameCol >= 0 ? cells[nameCol]?.trim() || null : null;
    const direction =
      senderCol >= 0 ? inferDirection(cells[senderCol] ?? '') : 'incoming';

    messages.push({
      lineUserId,
      displayName,
      direction,
      messageType: 'text',
      content,
      createdAt,
    });
  }

  return messages;
}

async function main(): Promise<void> {
  const { file, dir, dryRun, inspect } = parseArgs();
  if (!file && !dir) {
    console.log(`Usage:
  pnpm tacteq:import-chat --file path/to.csv
  pnpm tacteq:import-chat --dir path/to/extracted-zip
  pnpm tacteq:import-chat --file sample.csv --inspect`);
    process.exit(1);
  }

  loadHarnessConfig();
  const paths = file ? [file] : collectCsvFiles(dir!);
  if (paths.length === 0) throw new Error('No CSV files found.');

  const allMessages: ParsedMessage[] = [];
  for (const p of paths) {
    allMessages.push(...parseCsvFile(p, inspect));
  }
  if (inspect) return;

  console.log(`Parsed ${allMessages.length} messages from ${paths.length} file(s).`);

  const friends = await d1Query<{
    id: string;
    line_user_id: string;
    display_name: string | null;
  }>('SELECT id, line_user_id, display_name FROM friends');

  const byLineId = new Map(friends.map((f) => [f.line_user_id, f]));
  const byName = new Map<string, string>();
  for (const f of friends) {
    if (f.display_name) byName.set(f.display_name.trim(), f.id);
  }

  const accountRows = await d1Query<{ id: string }>('SELECT id FROM line_accounts LIMIT 1');
  const lineAccountId = accountRows[0]?.id ?? null;

  const statements: string[] = [];
  const chatTouched = new Set<string>();
  let skipped = 0;

  for (const msg of allMessages) {
    let friendId: string | undefined;
    if (msg.lineUserId) friendId = byLineId.get(msg.lineUserId)?.id;
    if (!friendId && msg.displayName) friendId = byName.get(msg.displayName);
    if (!friendId) {
      skipped += 1;
      continue;
    }

    const logId = crypto.randomUUID();
    const source =
      msg.direction === 'incoming' ? 'user' : 'manual';
    statements.push(
      `INSERT OR IGNORE INTO messages_log (id, friend_id, direction, message_type, content, source, line_account_id, created_at) VALUES (${sqlString(logId)}, ${sqlString(friendId)}, ${sqlString(msg.direction)}, ${sqlString(msg.messageType)}, ${sqlString(msg.content)}, ${sqlString(source)}, ${lineAccountId ? sqlString(lineAccountId) : 'NULL'}, ${sqlString(msg.createdAt)});`,
    );

    if (!chatTouched.has(friendId)) {
      chatTouched.add(friendId);
      const chatId = crypto.randomUUID();
      const now = jstNow();
      statements.push(
        `INSERT OR IGNORE INTO chats (id, friend_id, status, last_message_at, created_at, updated_at) VALUES (${sqlString(chatId)}, ${sqlString(friendId)}, 'resolved', ${sqlString(msg.createdAt)}, ${sqlString(now)}, ${sqlString(now)});`,
      );
    }
  }

  console.log(`Import rows: ${statements.length}, skipped (no friend match): ${skipped}`);

  if (dryRun) {
    console.log('Dry run — no D1 writes.');
    return;
  }

  if (statements.length === 0) {
    console.log('Nothing to import. Sync friends first (pnpm tacteq:sync-followers).');
    return;
  }

  const tmpDir = join(tmpdir(), `tacteq-import-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const batchSize = 40;
  for (let i = 0; i < statements.length; i += batchSize) {
    const chunk = statements.slice(i, i + batchSize);
    const batchFile = join(tmpDir, `batch-${i}.sql`);
    writeFileSync(batchFile, chunk.join('\n'));
    console.log(`Applying batch ${i / batchSize + 1}/${Math.ceil(statements.length / batchSize)}...`);
    await d1ExecuteFile(batchFile);
  }
  rmSync(tmpDir, { recursive: true, force: true });
  console.log('Import complete.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
