import { getFriendById } from '@line-crm/db';
import { TACTEQ_FORM_NAME } from './tacteq-form-notify.js';

export const TACTEQ_NOTION_DATABASE_SETTINGS_KEY = 'tacteq_notion_database_id';

const NOTION_API_VERSION = '2022-06-28';

/** Notion DB プロパティ名 ↔ 送信データキー */
const NOTION_FIELD_MAP: Record<string, string> = {
  お名前: 'customer_name',
  LINE表示名: '_line_display_name',
  送信日時: '_submitted_at',
  今回のご相談: 'consultation_type',
  対象箇所: 'target_areas',
  '対象箇所（詳細）': 'target_area_detail',
  お客様区分: 'customer_type',
  お住まいの種類: 'housing_type',
  '原因は？': 'damage_cause',
  工事中の物件: 'under_construction',
  フリガナ: 'furigana',
  郵便番号: 'postal_code',
  住所: 'address',
  お住まいの市町村: 'city',
  一番の目的: 'primary_purpose',
  ご希望の完了期日: 'deadline_preference',
  具体的な希望日: 'specific_deadline_date',
  '作業希望日・不可日': 'work_schedule_notes',
  ご要望: 'request_preference',
  お見積り初めて: 'first_time_repair',
  気になり始めた時期: 'noticed_since',
  ご希望の連絡手段: 'contact_method',
  お電話番号: 'phone',
  メールアドレス: 'email',
  火災保険: 'fire_insurance',
  個人情報同意: 'privacy_consent',
  送信ID: '_submission_id',
  Harness管理画面URL: '_admin_url',
};

function clip(text: string, max = 2000): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Notion phone_number は E.164 形式。失敗時はテキスト列にフォールバック */
function toNotionPhone(value: string): { phone_number: string } | ReturnType<typeof richText> {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return richText(raw);
  const national = digits.startsWith('81') ? digits.slice(2) : digits.replace(/^0/, '');
  if (national.length < 9) return richText(raw);
  return { phone_number: `+81${national}` };
}

function richText(value: string) {
  return { rich_text: [{ text: { content: clip(value) } }] };
}

function titleText(value: string) {
  return { title: [{ text: { content: clip(value) } }] };
}

async function getNotionDatabaseId(db: D1Database, lineAccountId: string | null): Promise<string | null> {
  if (!lineAccountId) return null;
  const row = await db
    .prepare(`SELECT value FROM account_settings WHERE line_account_id = ? AND key = ?`)
    .bind(lineAccountId, TACTEQ_NOTION_DATABASE_SETTINGS_KEY)
    .first<{ value: string }>();
  return row?.value?.trim() || null;
}

function normalizeDatabaseId(id: string): string {
  const compact = id.replace(/-/g, '');
  if (compact.length !== 32) return id;
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function buildProperties(opts: {
  displayName: string;
  submissionId: string;
  submissionData: Record<string, unknown>;
  submittedAt: string;
  adminPublicUrl?: string;
}): Record<string, unknown> {
  const d = opts.submissionData;
  const ctx: Record<string, unknown> = {
    ...d,
    _line_display_name: opts.displayName,
    _submission_id: opts.submissionId,
    _submitted_at: opts.submittedAt,
    _admin_url: opts.adminPublicUrl ? `${opts.adminPublicUrl.replace(/\/$/, '')}/form-submissions` : '',
  };

  const customerName = String(d.customer_name ?? opts.displayName ?? '');
  const consultation = String(d.consultation_type ?? '');
  const title = customerName
    ? `${customerName} — ${consultation || 'お問い合わせ'}`
    : consultation || 'お問い合わせ';

  const properties: Record<string, unknown> = {
    お名前: titleText(title),
    送信日時: { date: { start: opts.submittedAt } },
  };

  for (const [notionProp, dataKey] of Object.entries(NOTION_FIELD_MAP)) {
    if (notionProp === 'お名前' || notionProp === '送信日時') continue;
    const val = ctx[dataKey];
    if (val === undefined || val === null || String(val).trim() === '') continue;

    if (notionProp === 'お電話番号') {
      properties[notionProp] = toNotionPhone(String(val));
    } else if (notionProp === 'メールアドレス') {
      properties[notionProp] = { email: String(val).trim() };
    } else if (notionProp === 'Harness管理画面URL') {
      properties[notionProp] = { url: String(val) };
    } else {
      properties[notionProp] = richText(String(val));
    }
  }

  return properties;
}

/** TacTeQ フォーム送信を Notion データベースにバックアップ */
export async function backupTacteqFormToNotion(
  db: D1Database,
  notionToken: string | undefined,
  opts: {
    formName: string;
    friendId: string | null;
    lineAccountId: string | null;
    submissionId: string;
    submissionData: Record<string, unknown>;
    submittedAt: string;
    adminPublicUrl?: string;
    /** バックフィル等で D1 設定を読まずに直接指定する場合 */
    databaseIdOverride?: string;
    displayNameOverride?: string;
  },
): Promise<{ ok: boolean; notionPageId?: string; error?: string }> {
  if (opts.formName !== TACTEQ_FORM_NAME) return { ok: false, error: 'not tacteq form' };
  if (!notionToken?.trim()) return { ok: false, error: 'NOTION_API_TOKEN not configured' };

  const databaseId =
    opts.databaseIdOverride?.trim() || (await getNotionDatabaseId(db, opts.lineAccountId));
  if (!databaseId) return { ok: false, error: 'Notion database ID not configured' };

  let displayName = opts.displayNameOverride ?? '';
  if (!displayName && opts.friendId) {
    const friend = await getFriendById(db, opts.friendId);
    displayName = friend?.display_name ?? '';
  }

  const properties = buildProperties({
    displayName,
    submissionId: opts.submissionId,
    submissionData: opts.submissionData,
    submittedAt: opts.submittedAt,
    adminPublicUrl: opts.adminPublicUrl,
  });

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionToken.trim()}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: normalizeDatabaseId(databaseId) },
      properties,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Notion backup failed:', res.status, body);
    return { ok: false, error: `Notion API ${res.status}: ${body}` };
  }

  const json = (await res.json()) as { id?: string };
  return { ok: true, notionPageId: json.id };
}
