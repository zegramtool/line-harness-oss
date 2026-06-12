/**
 * Sync current LINE followers into Harness D1 (friends table).
 *
 * Usage:
 *   pnpm tacteq:sync-followers
 *   pnpm tacteq:sync-followers --dry-run
 *   LINE_CHANNEL_ACCESS_TOKEN=xxx pnpm tacteq:sync-followers
 *
 * Token is read from LINE_CHANNEL_ACCESS_TOKEN, or --token-from-d1 (line_accounts).
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadHarnessConfig,
  d1ExecuteFile,
  d1Query,
  sqlString,
  jstNow,
  loadLineAccessTokenFromD1,
} from './lib.ts';

const LINE_API = 'https://api.line.me';
const PROFILE_CONCURRENCY = 20;

interface UserProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

function parseArgs(): { dryRun: boolean; tokenFromD1: boolean; channelId?: string } {
  const args = process.argv.slice(2);
  let dryRun = false;
  let tokenFromD1 = false;
  let channelId: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--dry-run') dryRun = true;
    if (args[i] === '--token-from-d1') tokenFromD1 = true;
    if (args[i] === '--channel-id' && args[i + 1]) {
      channelId = args[i + 1];
      i += 1;
    }
  }
  return { dryRun, tokenFromD1, channelId };
}

async function lineGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${LINE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LINE API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function collectFollowerIds(token: string): Promise<string[]> {
  const ids: string[] = [];
  let start: string | undefined;
  do {
    const qs = new URLSearchParams({ limit: '1000' });
    if (start) qs.set('start', start);
    const page = await lineGet<{ userIds?: string[]; next?: string }>(
      token,
      `/v2/bot/followers/ids?${qs}`,
    );
    ids.push(...(page.userIds ?? []));
    start = page.next;
    console.log(`  fetched ${ids.length} follower ids...`);
  } while (start);
  return ids;
}

async function fetchProfile(token: string, userId: string): Promise<UserProfile | null> {
  try {
    return await lineGet<UserProfile>(token, `/v2/bot/profile/${encodeURIComponent(userId)}`);
  } catch {
    return null;
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main(): Promise<void> {
  const { dryRun, tokenFromD1, channelId } = parseArgs();
  const cfg = loadHarnessConfig();

  const token =
    process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ||
    (tokenFromD1 ? await loadLineAccessTokenFromD1(channelId) : '');
  if (!token) {
    throw new Error(
      'Set LINE_CHANNEL_ACCESS_TOKEN or pass --token-from-d1 to read from D1 line_accounts.',
    );
  }

  const accountRows = await d1Query<{ id: string; channel_id: string }>(
    channelId
      ? `SELECT id, channel_id FROM line_accounts WHERE channel_id = ${sqlString(channelId)}`
      : 'SELECT id, channel_id FROM line_accounts LIMIT 1',
  );
  const lineAccountId = accountRows[0]?.id;
  if (!lineAccountId) throw new Error('line_accounts row not found in D1.');

  console.log('Fetching follower IDs from LINE API...');
  const followerIds = await collectFollowerIds(token);
  console.log(`Total followers: ${followerIds.length}`);

  if (followerIds.length === 0) {
    console.log('Nothing to sync.');
    return;
  }

  console.log('Fetching profiles...');
  const profiles = await mapPool(followerIds, PROFILE_CONCURRENCY, (id) =>
    fetchProfile(token, id),
  );

  const existingRows = await d1Query<{ line_user_id: string }>(
    'SELECT line_user_id FROM friends',
  );
  const existingSet = new Set(existingRows.map((r) => r.line_user_id));

  const now = jstNow();
  const statements: string[] = [];
  let created = 0;
  let updated = 0;

  for (let i = 0; i < followerIds.length; i += 1) {
    const lineUserId = followerIds[i];
    const profile = profiles[i];
    const displayName = profile?.displayName ?? null;
    const pictureUrl = profile?.pictureUrl ?? null;
    const statusMessage = profile?.statusMessage ?? null;

    if (existingSet.has(lineUserId)) {
      updated += 1;
      statements.push(
        `UPDATE friends SET display_name = ${displayName ? sqlString(displayName) : 'NULL'}, picture_url = ${pictureUrl ? sqlString(pictureUrl) : 'NULL'}, status_message = ${statusMessage ? sqlString(statusMessage) : 'NULL'}, is_following = 1, line_account_id = ${sqlString(lineAccountId)}, updated_at = ${sqlString(now)} WHERE line_user_id = ${sqlString(lineUserId)};`,
      );
    } else {
      created += 1;
      const id = crypto.randomUUID();
      statements.push(
        `INSERT INTO friends (id, line_user_id, display_name, picture_url, status_message, is_following, line_account_id, metadata, score, created_at, updated_at) VALUES (${sqlString(id)}, ${sqlString(lineUserId)}, ${displayName ? sqlString(displayName) : 'NULL'}, ${pictureUrl ? sqlString(pictureUrl) : 'NULL'}, ${statusMessage ? sqlString(statusMessage) : 'NULL'}, 1, ${sqlString(lineAccountId)}, '{}', 0, ${sqlString(now)}, ${sqlString(now)});`,
      );
    }
  }

  console.log(`Upserts prepared: ${created} new, ${updated} update`);

  if (dryRun) {
    console.log('Dry run — no D1 writes.');
    return;
  }

  const tmpDir = join(tmpdir(), `tacteq-sync-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const batchSize = 50;
  for (let i = 0; i < statements.length; i += batchSize) {
    const chunk = statements.slice(i, i + batchSize);
    const file = join(tmpDir, `batch-${i}.sql`);
    writeFileSync(file, chunk.join('\n'));
    console.log(`Applying batch ${i / batchSize + 1}/${Math.ceil(statements.length / batchSize)}...`);
    await d1ExecuteFile(file);
  }
  rmSync(tmpDir, { recursive: true, force: true });

  const count = await d1Query<{ c: number }>('SELECT COUNT(*) as c FROM friends WHERE is_following = 1');
  console.log(`\nDone. Following friends in D1: ${count[0]?.c ?? '?'}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
