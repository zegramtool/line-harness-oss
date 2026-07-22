/**
 * フォーム回答・友だち metadata 表示用の日本語ラベル。
 * D1 forms.fields に無いキーや旧キーでも英語のまま出さないためのフォールバック。
 */
export const FORM_FIELD_LABELS: Record<string, string> = {
  consultation_type: '今回のご相談',
  target_area: '対象箇所',
  target_areas: '対象箇所',
  target_area_detail: '対象箇所（詳細）',
  customer_type: 'お客様区分',
  housing_type: 'お住まいの種類',
  damage_cause: '原因は？',
  under_construction: '工事中の物件',
  customer_name: 'お名前',
  furigana: 'フリガナ',
  postal_code: '郵便番号',
  address: '住所',
  city: '物件の所在地',
  primary_purpose: '一番の目的',
  deadline_preference: 'ご希望の完了期日',
  specific_deadline_date: '具体的な希望日',
  work_schedule_notes: '作業希望日・不可日',
  request_preference: 'ご要望',
  request_detail: 'ご要望',
  budget_sense: 'ご予算感',
  first_time_repair: 'お見積り・リペアは初めて',
  noticed_since: '気になり始めた時期',
  contact_method: 'ご希望の連絡手段',
  phone: 'お電話番号',
  email: 'メールアドレス',
  fire_insurance: '火災保険の使用',
  privacy_consent: '個人情報同意',
}

/** forms.fields のラベルを優先し、無ければ共通マップ、それも無ければキーそのもの */
export function resolveFormFieldLabel(
  key: string,
  fieldLabels?: Record<string, string> | null,
): string {
  const fromForm = fieldLabels?.[key]?.trim()
  if (fromForm) return fromForm
  return FORM_FIELD_LABELS[key] ?? key
}
