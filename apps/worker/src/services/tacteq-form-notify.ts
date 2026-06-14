import { LineClient } from '@line-crm/line-sdk';
import { getFriendById } from '@line-crm/db';
import { TACTEQ_FIELD_LABELS } from './tacteq-form-reply.js';

export const TACTEQ_FORM_NAME = 'TacTeQ お問い合わせ';
export const TACTEQ_FORM_NOTIFY_SETTINGS_KEY = 'tacteq_form_notify_line_user_ids';

function formatSubmissionSummary(data: Record<string, unknown>): string[] {
  return Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([key, value]) => {
      const label = TACTEQ_FIELD_LABELS[key] ?? key;
      const text = Array.isArray(value) ? value.join(', ') : String(value);
      return `・${label}: ${text}`;
    });
}

/** TacTeQ 問い合わせフォーム送信時、設定済みの LINE ユーザーへ管理者通知を送る */
export async function notifyTacteqFormSubmission(
  db: D1Database,
  opts: {
    formName: string;
    formId: string;
    friendId: string | null;
    lineAccessToken: string;
    lineAccountId: string | null;
    submissionData: Record<string, unknown>;
    adminPublicUrl?: string;
  },
): Promise<void> {
  if (opts.formName !== TACTEQ_FORM_NAME || !opts.lineAccountId) return;

  const row = await db
    .prepare(
      `SELECT value FROM account_settings WHERE line_account_id = ? AND key = ?`,
    )
    .bind(opts.lineAccountId, TACTEQ_FORM_NOTIFY_SETTINGS_KEY)
    .first<{ value: string }>();

  const lineUserIds: string[] = row?.value ? JSON.parse(row.value) : [];
  if (lineUserIds.length === 0) return;

  let displayName: string | null = null;
  if (opts.friendId) {
    const friend = await getFriendById(db, opts.friendId);
    displayName = friend?.display_name ?? null;
  }

  const adminBase = (opts.adminPublicUrl ?? '').replace(/\/$/, '');
  const detailUrl = adminBase
    ? `${adminBase}/form-submissions`
    : '管理画面 → 分析 → フォーム回答';

  const lines = [
    '【TacTeQ】お問い合わせフォームが送信されました',
    displayName ? `送信者: ${displayName}` : '',
    `確認: ${detailUrl}`,
    '',
    ...formatSubmissionSummary(opts.submissionData),
  ].filter((line) => line !== '');

  const client = new LineClient(opts.lineAccessToken);
  const text = lines.join('\n');

  await Promise.allSettled(
    lineUserIds.map((to) =>
      client.pushMessage(to, [{ type: 'text', text }]).catch((err) => {
        console.error(`TacTeQ form notify failed for ${to}:`, err);
      }),
    ),
  );
}
