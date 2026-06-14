/**
 * 過去の TacTeQ フォーム送信を Notion にバックフィルする。
 *
 * Usage:
 *   NOTION_API_TOKEN=secret_xxx pnpm tacteq:backfill-notion
 */
import { d1Query } from './lib.ts';

const FORM_ID = 'fd2d74cb-ef42-46fd-9960-d0725674d46a';
const DATABASE_ID = '14b79bcd-c6ae-457f-a880-7128439d42ac';
const ADMIN_PUBLIC_URL = 'https://tacteq-line-admin-88e31c57.pages.dev';

async function main(): Promise<void> {
  const token = process.env.NOTION_API_TOKEN?.trim();
  if (!token) throw new Error('NOTION_API_TOKEN is required');

  const { backupTacteqFormToNotion } = await import(
    '../../apps/worker/src/services/tacteq-notion-backup.ts'
  );

  const rows = await d1Query<{
    id: string;
    friend_id: string | null;
    data: string;
    created_at: string;
    line_account_id: string | null;
    display_name: string | null;
  }>(
    `SELECT fs.id, fs.friend_id, fs.data, fs.created_at, f.line_account_id, f.display_name
     FROM form_submissions fs
     LEFT JOIN friends f ON f.id = fs.friend_id
     WHERE fs.form_id = '${FORM_ID}'
     ORDER BY fs.created_at ASC`,
  );

  console.log(`Backfilling ${rows.length} submission(s) → Notion`);

  const dbStub = null as unknown as D1Database;

  for (const row of rows) {
    const submissionData = JSON.parse(row.data) as Record<string, unknown>;
    const result = await backupTacteqFormToNotion(dbStub, token, {
      formName: 'TacTeQ お問い合わせ',
      friendId: row.friend_id,
      lineAccountId: row.line_account_id,
      submissionId: row.id,
      submissionData,
      submittedAt: row.created_at,
      adminPublicUrl: ADMIN_PUBLIC_URL,
      databaseIdOverride: DATABASE_ID,
      displayNameOverride: row.display_name ?? '',
    });
    console.log(
      row.created_at,
      row.id.slice(0, 8),
      result.ok ? `✓ ${result.notionPageId}` : `✗ ${result.error}`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
