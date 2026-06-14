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
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { d1ExecuteFile, d1Query, sqlString, jstNow, loadHarnessConfig } from './lib.ts';

const CSV_IMPORT_SOURCE = 'csv_import';

interface ParsedMessage {
  lineUserId: string | null;
  displayName: string | null;
  direction: 'incoming' | 'outgoing';
  messageType: string;
  content: string;
  createdAt: string;
}

const DATETIME_KEYS = ['送信日時', '日時', 'timestamp', 'datetime', 'sent_at', 'date'];
const DATE_KEYS = ['送信日', 'date'];
const TIME_KEYS = ['送信時刻', 'time'];
const MESSAGE_KEYS = ['メッセージ', '内容', 'message', 'text', 'body', 'コンテンツ'];
const SENDER_KEYS = ['送信者', 'sender', 'from', 'direction', '種別'];
const SENDER_TYPE_KEYS = ['送信者タイプ', 'sender type', 'sender_type'];
const SENDER_NAME_KEYS = ['送信者名', 'sender name', 'sender_name'];
const USER_ID_KEYS = ['ユーザーid', 'user id', 'userid', 'line user id', 'line_user_id'];
const NAME_KEYS = ['表示名', '名前', 'display name', 'name', 'ユーザー名'];

/** LINE 公式アカウント管理画面のチャット履歴 CSV（先頭3行メタ＋5列形式） */
const LINE_OA_META_MARKERS = ['アカウント名', 'タイムゾーン', 'ダウンロード日時'];

function parseArgs(): {
  file?: string;
  dir?: string;
  dryRun: boolean;
  inspect: boolean;
  replace: boolean;
  createMissingFriends: boolean;
} {
  const args = process.argv.slice(2);
  let file: string | undefined;
  let dir: string | undefined;
  let dryRun = false;
  let inspect = false;
  let replace = false;
  let createMissingFriends = true;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--file' && args[i + 1]) {
      file = args[i + 1];
      i += 1;
    } else if (args[i] === '--dir' && args[i + 1]) {
      dir = args[i + 1];
      i += 1;
    } else if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--inspect') inspect = true;
    else if (args[i] === '--replace') replace = true;
    else if (args[i] === '--no-create-friends') createMissingFriends = false;
  }
  return { file, dir, dryRun, inspect, replace, createMissingFriends };
}

/** 表示名のゆらぎ（全角スペース・NFKC）を吸収 */
function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** ウェルカム文「〇〇さん、はじめまして」から名前を推定 */
function extractWelcomeName(content: string): string | null {
  const m = content.match(/^(.{1,40}?)さん、はじめまして/u);
  return m?.[1]?.trim() || null;
}

function csvLineUserIdForFile(filePath: string): string {
  const hash = createHash('sha256').update(basename(filePath)).digest('hex').slice(0, 32);
  return `csv-import-${hash}`;
}

function csvMessageId(friendId: string, msg: ParsedMessage): string {
  const hash = createHash('sha256')
    .update(`${friendId}|${msg.createdAt}|${msg.direction}|${msg.content}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

interface FriendRow {
  id: string;
  line_user_id: string;
  display_name: string | null;
}

class FriendResolver {
  private readonly byLineId = new Map<string, FriendRow>();
  private readonly byExact = new Map<string, string>();
  private readonly byNorm = new Map<string, string>();
  private readonly all: FriendRow[];

  constructor(friends: FriendRow[]) {
    this.all = friends;
    for (const f of friends) {
      this.byLineId.set(f.line_user_id, f);
      if (f.display_name) {
        const trimmed = f.display_name.trim();
        this.byExact.set(trimmed, f.id);
        this.byNorm.set(normalizeName(trimmed), f.id);
      }
    }
  }

  register(friend: FriendRow): void {
    this.all.push(friend);
    this.byLineId.set(friend.line_user_id, friend);
    if (friend.display_name) {
      const trimmed = friend.display_name.trim();
      this.byExact.set(trimmed, friend.id);
      this.byNorm.set(normalizeName(trimmed), friend.id);
    }
  }

  private fuzzyMatch(name: string): string | undefined {
    const norm = normalizeName(name);
    if (!norm) return undefined;
    const exact = this.byNorm.get(norm);
    if (exact) return exact;

    const candidates = this.all.filter((f) => {
      if (!f.display_name) return false;
      const fn = normalizeName(f.display_name);
      return fn.includes(norm) || norm.includes(fn);
    });
    if (candidates.length === 1) return candidates[0].id;
    return undefined;
  }

  resolveForFile(
    filePath: string,
    messages: ParsedMessage[],
  ): { friendId?: string; displayLabel: string } {
    const fromFile = displayNameFromFilename(filePath);
    const csvLineId = csvLineUserIdForFile(filePath);
    const existingCsv = this.byLineId.get(csvLineId);
    if (existingCsv) return { friendId: existingCsv.id, displayLabel: existingCsv.display_name ?? fromFile ?? csvLineId };

    const candidates = new Set<string>();
    if (fromFile && fromFile !== 'Unknown') candidates.add(fromFile);
    for (const msg of messages) {
      if (msg.displayName && msg.displayName !== 'Unknown') candidates.add(msg.displayName.trim());
      if (msg.direction === 'outgoing') {
        const welcome = extractWelcomeName(msg.content);
        if (welcome) candidates.add(welcome);
      }
    }

    for (const name of candidates) {
      const hit = this.byExact.get(name) ?? this.fuzzyMatch(name);
      if (hit) return { friendId: hit, displayLabel: name };
    }

    const label =
      fromFile && fromFile !== 'Unknown'
        ? fromFile
        : [...candidates].find((n) => n !== 'Unknown') ??
          (fromFile ? `Unknown（${basename(filePath, '.csv')}）` : basename(filePath, '.csv'));

    return { displayLabel: label };
  }
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

/** 引用符内の改行を含む CSV 全体をレコード配列にパース */
function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      i += 1;
      row.push(cell);
      if (row.some((c) => c.trim().length > 0)) rows.push(row.map((c) => c.trim()));
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      if (row.some((c) => c.trim().length > 0)) rows.push(row.map((c) => c.trim()));
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.trim().length > 0)) rows.push(row.map((c) => c.trim()));
  }

  return rows;
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

function toJstStringFromDate(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60_000);
  return `${jst.toISOString().slice(0, -1)}+09:00`;
}

function parseDatetime(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const normalized = s.replace(/\//g, '-').replace(' ', 'T');
  const d = new Date(normalized.includes('+') || normalized.endsWith('Z') ? normalized : normalized);
  if (Number.isNaN(d.getTime())) return null;
  return toJstStringFromDate(d);
}

/** LINE OA エクスポートの「送信日」「送信時刻」列（JST） */
function parseDateAndTime(dateRaw: string, timeRaw: string): string | null {
  const date = dateRaw.trim().replace(/\//g, '-');
  const time = timeRaw.trim();
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  return toJstStringFromDate(d);
}

function inferDirection(senderCell: string): 'incoming' | 'outgoing' {
  const s = senderCell.toLowerCase();
  if (
    s === 'user' ||
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

/** `181_20250815_20250815_みきてぃ.csv` → `みきてぃ` */
function displayNameFromFilename(filePath: string): string | null {
  let rest = basename(filePath, '.csv');
  rest = rest.replace(/^\d+_/, '');
  while (/^\d{8}_/.test(rest)) {
    rest = rest.replace(/^\d{8}_/, '');
  }
  const name = rest.trim();
  return name || null;
}

function findLineOaHeaderIndex(records: string[][]): number {
  for (let i = 0; i < records.length; i += 1) {
    const cells = records[i];
    if (cells[0] === '送信者タイプ' && cells.includes('内容')) return i;
  }
  return -1;
}

function parseLineOaCsvFile(filePath: string, inspect: boolean): ParsedMessage[] {
  const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const records = parseCsvRecords(raw);
  const headerIdx = findLineOaHeaderIndex(records);
  if (headerIdx < 0) return [];

  const headers = records[headerIdx];
  if (inspect) {
    console.log(`\n--- ${filePath} (LINE OA format) ---`);
    console.log('Headers:', headers);
    console.log('Display name from filename:', displayNameFromFilename(filePath));
    return [];
  }

  const senderTypeCol = pickColumn(headers, SENDER_TYPE_KEYS);
  const senderNameCol = pickColumn(headers, SENDER_NAME_KEYS);
  const dateCol = pickColumn(headers, DATE_KEYS);
  const timeCol = pickColumn(headers, TIME_KEYS);
  const msgCol = pickColumn(headers, MESSAGE_KEYS);

  if (senderTypeCol < 0 || dateCol < 0 || timeCol < 0 || msgCol < 0) {
    throw new Error(`${filePath}: LINE OA columns not found. Run with --inspect.`);
  }

  const fileDisplayName = displayNameFromFilename(filePath);
  const messages: ParsedMessage[] = [];

  for (let i = headerIdx + 1; i < records.length; i += 1) {
    const cells = records[i];
    const content = cells[msgCol]?.trim();
    if (!content) continue;
    const createdAt = parseDateAndTime(cells[dateCol] ?? '', cells[timeCol] ?? '');
    if (!createdAt) continue;

    const senderType = cells[senderTypeCol]?.trim() ?? '';
    const senderName = senderNameCol >= 0 ? cells[senderNameCol]?.trim() : '';
    const direction = inferDirection(senderType);
    const displayName =
      direction === 'incoming' && senderName && senderName !== 'Unknown'
        ? senderName
        : fileDisplayName;

    messages.push({
      lineUserId: null,
      displayName,
      direction,
      messageType: 'text',
      content,
      createdAt,
    });
  }

  return messages;
}

function parseCsvFile(filePath: string, inspect: boolean): ParsedMessage[] {
  const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const records = parseCsvRecords(raw);
  if (records.length < 2) return [];

  const firstCell = records[0][0];
  if (LINE_OA_META_MARKERS.includes(firstCell) || findLineOaHeaderIndex(records) >= 0) {
    return parseLineOaCsvFile(filePath, inspect);
  }

  const headers = records[0];
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

  for (let i = 1; i < records.length; i += 1) {
    const cells = records[i];
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

async function applySqlBatches(statements: string[], label: string): Promise<void> {
  if (statements.length === 0) return;
  const tmpDir = join(tmpdir(), `tacteq-import-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const batchSize = 40;
  for (let i = 0; i < statements.length; i += batchSize) {
    const chunk = statements.slice(i, i + batchSize);
    const batchFile = join(tmpDir, `batch-${i}.sql`);
    writeFileSync(batchFile, chunk.join('\n'));
    console.log(`${label} batch ${i / batchSize + 1}/${Math.ceil(statements.length / batchSize)}...`);
    await d1ExecuteFile(batchFile);
  }
  rmSync(tmpDir, { recursive: true, force: true });
}

async function main(): Promise<void> {
  const { file, dir, dryRun, inspect, replace, createMissingFriends } = parseArgs();
  if (!file && !dir) {
    console.log(`Usage:
  pnpm tacteq:import-chat --file path/to.csv
  pnpm tacteq:import-chat --dir path/to/extracted-zip
  pnpm tacteq:import-chat --dir path/to/folder --replace
  pnpm tacteq:import-chat --file sample.csv --inspect`);
    process.exit(1);
  }

  loadHarnessConfig();
  const paths = file ? [file] : collectCsvFiles(dir!);
  if (paths.length === 0) throw new Error('No CSV files found.');

  const messagesByFile: Array<{ filePath: string; messages: ParsedMessage[] }> = [];
  for (const p of paths) {
    messagesByFile.push({ filePath: p, messages: parseCsvFile(p, inspect) });
  }
  if (inspect) return;

  const allMessages = messagesByFile.flatMap((x) => x.messages);
  const filesWithMessages = messagesByFile.filter((x) => x.messages.length > 0).length;
  console.log(
    `Parsed ${allMessages.length} messages from ${paths.length} file(s) (${filesWithMessages} with content).`,
  );

  const friends = await d1Query<FriendRow>(
    'SELECT id, line_user_id, display_name FROM friends',
  );
  const resolver = new FriendResolver(friends);

  const accountRows = await d1Query<{ id: string }>('SELECT id FROM line_accounts LIMIT 1');
  const lineAccountId = accountRows[0]?.id ?? null;
  if (!lineAccountId) throw new Error('line_accounts row not found in D1.');

  const friendCreates: string[] = [];
  const fileFriendMap = new Map<string, string>();
  let createdFriends = 0;
  let skippedFiles = 0;
  let skippedMessages = 0;

  for (const { filePath, messages } of messagesByFile) {
    if (messages.length === 0) continue;
    const resolved = resolver.resolveForFile(filePath, messages);
    if (resolved.friendId) {
      fileFriendMap.set(filePath, resolved.friendId);
      continue;
    }

    if (!createMissingFriends) {
      skippedFiles += 1;
      skippedMessages += messages.length;
      continue;
    }

    const friendId = crypto.randomUUID();
    const lineUserId = csvLineUserIdForFile(filePath);
    const displayName = resolved.displayLabel;
    const now = jstNow();
    const metadata = JSON.stringify({
      csv_import: true,
      csv_file: basename(filePath),
    });

    friendCreates.push(
      `INSERT OR IGNORE INTO friends (id, line_user_id, display_name, is_following, line_account_id, metadata, score, created_at, updated_at) VALUES (${sqlString(friendId)}, ${sqlString(lineUserId)}, ${sqlString(displayName)}, 0, ${sqlString(lineAccountId)}, ${sqlString(metadata)}, 0, ${sqlString(now)}, ${sqlString(now)});`,
    );
    resolver.register({ id: friendId, line_user_id: lineUserId, display_name: displayName });
    fileFriendMap.set(filePath, friendId);
    createdFriends += 1;
  }

  const statements: string[] = [];
  const lastMessageAt = new Map<string, string>();

  for (const { filePath, messages } of messagesByFile) {
    const friendId = fileFriendMap.get(filePath);
    if (!friendId) continue;

    for (const msg of messages) {
      const logId = csvMessageId(friendId, msg);
      statements.push(
        `INSERT OR IGNORE INTO messages_log (id, friend_id, direction, message_type, content, source, line_account_id, created_at) VALUES (${sqlString(logId)}, ${sqlString(friendId)}, ${sqlString(msg.direction)}, ${sqlString(msg.messageType)}, ${sqlString(msg.content)}, ${sqlString(CSV_IMPORT_SOURCE)}, ${sqlString(lineAccountId)}, ${sqlString(msg.createdAt)});`,
      );
      const prev = lastMessageAt.get(friendId);
      if (!prev || msg.createdAt > prev) lastMessageAt.set(friendId, msg.createdAt);
    }
  }

  const existingChats = await d1Query<{ friend_id: string }>('SELECT friend_id FROM chats');
  const chatFriendSet = new Set(existingChats.map((c) => c.friend_id));

  const chatStatements: string[] = [];
  const now = jstNow();
  for (const [friendId, lastAt] of lastMessageAt) {
    if (chatFriendSet.has(friendId)) {
      chatStatements.push(
        `UPDATE chats SET last_message_at = ${sqlString(lastAt)}, updated_at = ${sqlString(now)} WHERE friend_id = ${sqlString(friendId)} AND (last_message_at IS NULL OR last_message_at < ${sqlString(lastAt)});`,
      );
    } else {
      const chatId = crypto.randomUUID();
      chatStatements.push(
        `INSERT INTO chats (id, friend_id, status, last_message_at, created_at, updated_at) VALUES (${sqlString(chatId)}, ${sqlString(friendId)}, 'resolved', ${sqlString(lastAt)}, ${sqlString(now)}, ${sqlString(now)});`,
      );
      chatFriendSet.add(friendId);
    }
  }

  console.log(`Messages to import: ${statements.length}`);
  console.log(`New historical friends: ${createdFriends}`);
  console.log(`Skipped files: ${skippedFiles} (${skippedMessages} messages)`);

  if (dryRun) {
    console.log('Dry run — no D1 writes.');
    return;
  }

  if (replace) {
    console.log('Removing previous CSV import data...');
    await d1ExecuteFile(
      writeReplaceSql(
        join(tmpdir(), `tacteq-import-replace-${Date.now()}.sql`),
      ),
    );
  }

  if (statements.length === 0) {
    console.log('Nothing to import.');
    return;
  }

  await applySqlBatches(friendCreates, 'Creating friends');
  await applySqlBatches(statements, 'Importing messages');
  await applySqlBatches(chatStatements, 'Updating chats');
  console.log('Import complete.');
}

function writeReplaceSql(path: string): string {
  const sql = [
    `DELETE FROM messages_log WHERE source = ${sqlString(CSV_IMPORT_SOURCE)};`,
  ].join('\n');
  writeFileSync(path, sql);
  return path;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
