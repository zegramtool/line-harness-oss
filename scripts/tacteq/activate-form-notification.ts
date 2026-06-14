/**
 * TacTeQ フォーム送信時の管理者 LINE 通知先を登録する。
 *
 * 通知先は TacTeQ 公式アカウントの友だちである LINE ユーザー ID（U で始まる文字列）。
 * 複数指定可（カンマ区切り）。
 *
 * Usage:
 *   TACTEQ_NOTIFY_LINE_USER_IDS=Uxxx,Uyyy pnpm tacteq:activate-form-notification
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { d1Query, jstNow, REPO_ROOT, sqlString } from './lib.ts';

const TACTEQ_FORM_NOTIFY_SETTINGS_KEY = 'tacteq_form_notify_line_user_ids';

async function main(): Promise<void> {
  const raw = process.env.TACTEQ_NOTIFY_LINE_USER_IDS?.trim();
  if (!raw) {
    throw new Error(
      'TACTEQ_NOTIFY_LINE_USER_IDS is required (comma-separated LINE user IDs, e.g. U1234abc,U5678def)',
    );
  }

  const lineUserIds = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (lineUserIds.length === 0) {
    throw new Error('No valid LINE user IDs in TACTEQ_NOTIFY_LINE_USER_IDS');
  }

  for (const id of lineUserIds) {
    if (!/^U[0-9a-f]{32}$/i.test(id)) {
      console.warn(`Warning: "${id}" does not look like a LINE user ID (expected U + 32 hex chars)`);
    }
  }

  const accounts = await d1Query<{ id: string; name: string }>(
    'SELECT id, name FROM line_accounts ORDER BY display_order ASC LIMIT 1',
  );
  const account = accounts[0];
  if (!account) throw new Error('No line_accounts row in D1');

  const now = jstNow();
  const value = JSON.stringify(lineUserIds);
  const settingsId = crypto.randomUUID();

  await d1Query(
    `INSERT INTO account_settings (id, line_account_id, key, value, created_at, updated_at)
     VALUES (${sqlString(settingsId)}, ${sqlString(account.id)}, ${sqlString(TACTEQ_FORM_NOTIFY_SETTINGS_KEY)}, ${sqlString(value)}, ${sqlString(now)}, ${sqlString(now)})
     ON CONFLICT (line_account_id, key) DO UPDATE SET value = ${sqlString(value)}, updated_at = ${sqlString(now)}`,
  );

  console.log('\n--- TacTeQ form notification ---');
  console.log('LINE account:', account.name, `(${account.id})`);
  console.log('Notify LINE user IDs:', lineUserIds.join(', '));
  console.log('Settings key:', TACTEQ_FORM_NOTIFY_SETTINGS_KEY);
  const rawCfg = JSON.parse(
    readFileSync(join(REPO_ROOT, '.line-harness-config.json'), 'utf8'),
  ) as { adminPublicUrl?: string; adminUrl?: string };
  const adminUrl = rawCfg.adminPublicUrl ?? rawCfg.adminUrl ?? 'https://tacteq-line-admin-88e31c57.pages.dev';
  console.log('Admin UI:', `${adminUrl}/form-submissions`);
  console.log('\nSubmissions are stored in D1 table form_submissions.');
  console.log('View: 管理画面 → 分析 → フォーム回答 → 「TacTeQ お問い合わせ」');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
