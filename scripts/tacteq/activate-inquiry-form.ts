/**
 * TacTeQ お問い合わせフォーム（6ステップ LIFF）を作成・更新する。
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harnessFetch } from './lib.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FORM_CONFIG_PATH = join(SCRIPT_DIR, 'tacteq-form.json');

const DEFAULT_LIFF_URL = 'https://liff.line.me/2010377322-vRCNhYfx';
const TAG_NAME = '問合せ済';
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

interface TagRow {
  id: string;
  name: string;
}

interface FormRow {
  id: string;
  name: string;
}

async function ensureTag(): Promise<string> {
  const existing = await harnessFetch<TagRow[]>('/api/tags');
  const found = existing?.find((t) => t.name === TAG_NAME);
  if (found) {
    console.log(`Tag exists: ${TAG_NAME} (${found.id})`);
    return found.id;
  }
  const created = await harnessFetch<TagRow>('/api/tags', {
    method: 'POST',
    body: JSON.stringify({ name: TAG_NAME, color: '#FF8C00' }),
  });
  console.log(`Created tag: ${TAG_NAME} (${created.id})`);
  return created.id;
}

async function upsertForm(tagId: string): Promise<string> {
  const forms = await harnessFetch<FormRow[]>('/api/forms');
  const existing = forms?.find((f) => f.name === FORM_NAME);

  const body = {
    name: FORM_NAME,
    description: 'リペア・見積りのお問い合わせ（6ステップ）',
    fields: FORM_FIELDS,
    onSubmitTagId: tagId,
    onSubmitMessageType: null,
    onSubmitMessageContent: null,
    saveToMetadata: true,
    isActive: true,
  };

  if (existing) {
    const updated = await harnessFetch<FormRow>(`/api/forms/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    console.log(`Updated form: ${FORM_NAME} (${updated.id})`);
    return updated.id;
  }

  const created = await harnessFetch<FormRow>('/api/forms', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  console.log(`Created form: ${FORM_NAME} (${created.id})`);
  return created.id;
}

async function main(): Promise<void> {
  const liffBase = process.env.TACTEQ_LIFF_URL?.trim() || DEFAULT_LIFF_URL;
  const tagId = await ensureTag();
  const formId = await upsertForm(tagId);
  const inquiryUrl = `${liffBase}?page=tacteq-inquiry&id=${formId}`;

  writeFileSync(
    FORM_CONFIG_PATH,
    JSON.stringify({ formId, inquiryUrl, tagId, updatedAt: new Date().toISOString() }, null, 2) + '\n',
  );

  console.log('\n--- TacTeQ inquiry form ---');
  console.log('Form ID:', formId);
  console.log('LIFF URL:', inquiryUrl);
  console.log('Steps: 6');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
