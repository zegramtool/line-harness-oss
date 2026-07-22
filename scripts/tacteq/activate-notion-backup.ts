/**
 * TacTeQ フォーム → Notion DB バックアップの設定
 *
 * 事前準備:
 *   1. https://www.notion.so/my-integrations で Internal Integration 作成
 *   2. Notion でバックアップ先 DB を作成（プロパティは下記スキーマ参照）
 *   3. DB ページ右上 … → コネクト → インテグレーションを追加
 *   4. DB の URL から database_id を取得（32文字の UUID）
 *   5. Worker にシークレット登録:
 *        cd apps/worker && npx wrangler secret put NOTION_API_TOKEN
 *
 * Usage:
 *   NOTION_DATABASE_ID=xxxxxxxx pnpm tacteq:activate-notion-backup
 *   NOTION_API_TOKEN=secret_xxx NOTION_DATABASE_ID=xxx pnpm tacteq:activate-notion-backup --test
 *   NOTION_API_TOKEN=secret_xxx NOTION_DATABASE_ID=xxx pnpm tacteq:sync-notion-schema
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { d1Query, jstNow, REPO_ROOT, sqlString } from './lib.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(SCRIPT_DIR, 'tacteq-notion.json');
const SETTINGS_KEY = 'tacteq_notion_database_id';

/** Notion DB に追加するプロパティ（PATCH で不足分のみ追加） */
const TACTEQ_NOTION_SYNC_PROPERTIES: Record<string, Record<string, unknown>> = {
  '原因は？': { rich_text: {} },
  工事中の物件: { rich_text: {} },
  ご予算感: { rich_text: {} },
};

const SCHEMA_HELP = `Notion データベースに次の列（プロパティ）を作成してください:

| プロパティ名 | 種類 |
|-------------|------|
| お名前 | タイトル |
| 送信日時 | 日付 |
| LINE表示名 | テキスト |
| 今回のご相談 | テキスト |
| 対象箇所 | テキスト |
| 対象箇所（詳細） | テキスト |
| お客様区分 | テキスト |
| お住まいの種類 | テキスト |
| 原因は？ | テキスト |
| 工事中の物件 | テキスト |
| お住まいの市町村 | テキスト |
| ご予算感 | テキスト |
| 一番の目的 | テキスト |
| ご希望・納期 | テキスト |
| ご希望の連絡手段 | テキスト |
| お電話番号 | 電話番号 |
| メールアドレス | メール |
| 送信ID | テキスト |
| Harness管理画面URL | URL |
`;

function normalizeDatabaseId(id: string): string {
  const compact = id.replace(/-/g, '');
  if (compact.length !== 32) return id;
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

async function testNotionConnection(databaseId: string, token: string): Promise<void> {
  const res = await fetch(`https://api.notion.com/v1/databases/${normalizeDatabaseId(databaseId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API test failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { title?: Array<{ plain_text?: string }> };
  const dbTitle = json.title?.[0]?.plain_text ?? '(無題)';
  console.log(`Notion DB 接続 OK: 「${dbTitle}」`);
}

async function syncNotionSchema(databaseId: string, token: string): Promise<void> {
  const normalized = normalizeDatabaseId(databaseId);
  const headers = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  const getRes = await fetch(`https://api.notion.com/v1/databases/${normalized}`, { headers });
  if (!getRes.ok) {
    const body = await getRes.text();
    throw new Error(`Notion DB fetch failed (${getRes.status}): ${body}`);
  }
  const db = (await getRes.json()) as { properties?: Record<string, unknown> };
  const existing = db.properties ?? {};
  const missing: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(TACTEQ_NOTION_SYNC_PROPERTIES)) {
    if (!existing[name]) missing[name] = schema;
  }
  if (Object.keys(missing).length === 0) {
    console.log('Notion schema: 追加するプロパティはありません');
    return;
  }

  const patchRes = await fetch(`https://api.notion.com/v1/databases/${normalized}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ properties: missing }),
  });
  if (!patchRes.ok) {
    const body = await patchRes.text();
    throw new Error(`Notion schema sync failed (${patchRes.status}): ${body}`);
  }
  console.log('Notion schema: 追加しました →', Object.keys(missing).join(', '));
}

function resolveDatabaseId(): string {
  const fromEnv = process.env.NOTION_DATABASE_ID?.trim();
  if (fromEnv) return fromEnv;
  if (existsSync(CONFIG_PATH)) {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as { databaseId?: string };
    if (parsed.databaseId?.trim()) return parsed.databaseId.trim();
  }
  throw new Error('NOTION_DATABASE_ID is required (Notion データベースの UUID)');
}

async function main(): Promise<void> {
  const databaseId = resolveDatabaseId();
  const testMode = process.argv.includes('--test');
  const syncOnly = process.argv.includes('--sync-schema');
  const token = process.env.NOTION_API_TOKEN?.trim();

  if (testMode) {
    if (!token) throw new Error('NOTION_API_TOKEN is required for --test');
    await testNotionConnection(databaseId, token);
    return;
  }

  if (syncOnly) {
    if (!token) throw new Error('NOTION_API_TOKEN is required for --sync-schema');
    await syncNotionSchema(databaseId, token);
    return;
  }

  if (token) {
    await syncNotionSchema(databaseId, token);
  } else {
    console.log('NOTION_API_TOKEN 未設定のためスキーマ同期はスキップ（pnpm tacteq:sync-notion-schema で後から実行可）');
  }

  const accounts = await d1Query<{ id: string; name: string }>(
    'SELECT id, name FROM line_accounts ORDER BY display_order ASC LIMIT 1',
  );
  const account = accounts[0];
  if (!account) throw new Error('No line_accounts row in D1');

  const now = jstNow();
  const normalizedId = normalizeDatabaseId(databaseId);
  const settingsId = crypto.randomUUID();

  await d1Query(
    `INSERT INTO account_settings (id, line_account_id, key, value, created_at, updated_at)
     VALUES (${sqlString(settingsId)}, ${sqlString(account.id)}, ${sqlString(SETTINGS_KEY)}, ${sqlString(normalizedId)}, ${sqlString(now)}, ${sqlString(now)})
     ON CONFLICT (line_account_id, key) DO UPDATE SET value = ${sqlString(normalizedId)}, updated_at = ${sqlString(now)}`,
  );

  writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ databaseId: normalizedId, updatedAt: now }, null, 2) + '\n',
  );

  console.log('\n--- TacTeQ Notion backup ---');
  console.log('Database ID:', normalizedId);
  console.log('LINE account:', account.name);
  console.log('Config file:', CONFIG_PATH);
  console.log('\n' + SCHEMA_HELP);
  if (!testMode) {
    console.log(
      '次のステップ: cd apps/worker && npx wrangler secret put NOTION_API_TOKEN',
    );
    console.log('接続テスト: NOTION_API_TOKEN=secret_xxx NOTION_DATABASE_ID=' + normalizedId + ' pnpm tacteq:activate-notion-backup --test');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
