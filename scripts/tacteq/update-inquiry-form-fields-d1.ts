/**
 * TacTeQ お問い合わせフォームの fields を D1 で直接更新する。
 * （Harness API キーが無い環境向け。wrangler + CLOUDFLARE_API_TOKEN が必要）
 */
import { d1Query } from './lib.ts';

const FORM_NAME = 'TacTeQ お問い合わせ';

const FORM_FIELDS = [
  { name: 'consultation_type', label: '今回のご相談', type: 'text', required: true },
  { name: 'target_areas', label: '対象箇所', type: 'text', required: true },
  { name: 'target_area_detail', label: '対象箇所（詳細）', type: 'text', required: false },
  { name: 'customer_type', label: 'お客様区分', type: 'text', required: true },
  { name: 'housing_type', label: 'お住まいの種類', type: 'text', required: true },
  { name: 'damage_cause', label: '原因は？', type: 'text', required: true },
  { name: 'under_construction', label: '工事中の物件', type: 'text', required: true },
  { name: 'customer_name', label: 'お名前', type: 'text', required: true },
  { name: 'furigana', label: 'フリガナ', type: 'text', required: true },
  { name: 'postal_code', label: '郵便番号', type: 'text', required: false },
  { name: 'address', label: '住所', type: 'text', required: false },
  { name: 'city', label: '物件の所在地', type: 'text', required: true },
  { name: 'primary_purpose', label: '一番の目的', type: 'textarea', required: true },
  { name: 'deadline_preference', label: 'ご希望の完了期日', type: 'text', required: true },
  { name: 'specific_deadline_date', label: '具体的な希望日', type: 'text', required: false },
  { name: 'work_schedule_notes', label: '作業希望日・不可日', type: 'textarea', required: false },
  { name: 'request_preference', label: 'ご要望', type: 'text', required: true },
  { name: 'budget_sense', label: 'ご予算感', type: 'text', required: false },
  { name: 'first_time_repair', label: 'お見積り・リペアは初めて', type: 'text', required: true },
  { name: 'noticed_since', label: '気になり始めた時期', type: 'text', required: false },
  { name: 'contact_method', label: 'ご希望の連絡手段', type: 'text', required: true },
  { name: 'phone', label: 'お電話番号', type: 'tel', required: false },
  { name: 'email', label: 'メールアドレス', type: 'email', required: false },
  { name: 'fire_insurance', label: '火災保険の使用', type: 'text', required: true },
  { name: 'privacy_consent', label: '個人情報同意', type: 'text', required: true },
];

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main(): Promise<void> {
  const rows = await d1Query<{ id: string; name: string }>(
    `SELECT id, name FROM forms WHERE name = ${sqlString(FORM_NAME)} LIMIT 1`,
  );
  const form = rows[0];
  if (!form) {
    throw new Error(`Form not found: ${FORM_NAME}`);
  }

  const fieldsJson = JSON.stringify(FORM_FIELDS);
  await d1Query(
    `UPDATE forms SET fields = ${sqlString(fieldsJson)}, description = ${sqlString(
      'リペア・見積りのお問い合わせ（6ステップ）',
    )}, updated_at = datetime('now') WHERE id = ${sqlString(form.id)}`,
  );

  console.log(`Updated form fields via D1: ${FORM_NAME} (${form.id})`);
  console.log(`Fields: ${FORM_FIELDS.length} (includes budget_sense, city=物件の所在地)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
