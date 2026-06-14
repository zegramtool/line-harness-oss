/** TacTeQ 問い合わせフォーム — 選択肢・フィールド定義（LIFF / Notion / 返信で共有） */

export const TOTAL_STEPS = 6;

export const CONSULTATION_TYPES = [
  '傷の修繕',
  '劣化の修繕',
  'リフォーム',
  '床鳴り',
  '塗装',
  'その他のご相談',
] as const;

export const ALL_AREAS = [
  '床',
  '枠',
  'ドア',
  'カウンター',
  'コンクリート',
  'ガラス',
  '家具',
  'アルミサッシ',
  '金属系',
  '石材系',
  '自由入力',
];

export const PAINT_AREAS = ['枠', 'ドア', '家具', 'アルミサッシ', '金属系', 'その他'];

export const CUSTOMER_TYPES = ['業者様', '個人様'] as const;

export const HOUSING_TYPES = [
  '持家（戸建て）',
  '持家（マンション）',
  '賃貸・借家',
  '店舗',
  '業者様がお客様先で傷をつけてしまったケース',
] as const;

export const UNDER_CONSTRUCTION_OPTIONS = ['はい', 'いいえ', 'わからない'] as const;

export const DEADLINE_OPTIONS = [
  '緊急（できる限り早く）',
  '1週間以内',
  '1ヶ月以内',
  'いつでもいい',
] as const;

export const REQUEST_PREFERENCES = [
  '費用重視',
  '仕上がり重視',
  'プロに相談して決めたい',
] as const;

export const CONTACT_METHODS = ['LINE', '電話', 'ショートメール', 'メール'] as const;

export const FIRE_INSURANCE_OPTIONS = [
  '使用予定',
  '問い合わせ中',
  '使用しない',
  'わからない',
] as const;

export const FIRST_TIME_OPTIONS = ['はい', 'いいえ'] as const;

export const TACTEQ_FIELD_LABELS: Record<string, string> = {
  consultation_type: '今回のご相談',
  target_areas: '対象箇所',
  target_area_detail: '対象箇所（詳細）',
  customer_type: 'お客様区分',
  housing_type: 'お住まいの種類',
  under_construction: '工事中の物件',
  customer_name: 'お名前',
  furigana: 'フリガナ',
  postal_code: '郵便番号',
  address: '住所',
  city: 'お住まいの市区町村',
  primary_purpose: '一番の目的',
  deadline_preference: 'ご希望の完了期日',
  specific_deadline_date: '具体的な希望日',
  work_schedule_notes: '作業希望日・不可日',
  request_preference: 'ご要望',
  first_time_repair: 'お見積り・リペアは初めて',
  noticed_since: '気になり始めた時期',
  contact_method: 'ご希望の連絡手段',
  phone: 'お電話番号',
  email: 'メールアドレス',
  fire_insurance: '火災保険の使用',
  privacy_consent: '個人情報同意',
};

export const TACTEQ_FIELD_ORDER = [
  'consultation_type',
  'target_areas',
  'target_area_detail',
  'customer_type',
  'housing_type',
  'under_construction',
  'customer_name',
  'furigana',
  'postal_code',
  'address',
  'city',
  'primary_purpose',
  'deadline_preference',
  'specific_deadline_date',
  'work_schedule_notes',
  'request_preference',
  'first_time_repair',
  'noticed_since',
  'contact_method',
  'phone',
  'email',
  'fire_insurance',
] as const;

export function areasForConsultation(type: string): string[] {
  if (type === '床鳴り') return ['床'];
  if (type === '塗装') return PAINT_AREAS;
  return ALL_AREAS;
}

export function needsAreaDetail(areas: string[]): boolean {
  return areas.some((a) => a === '自由入力' || a === 'その他');
}

/** チェックボックスの「自由入力」「その他」を、ユーザーが入力した詳細テキストに置き換える */
export function formatTargetAreasForSubmission(areas: string[], detail: string): string {
  const trimmed = detail.trim();
  return areas
    .map((area) => (needsAreaDetail([area]) && trimmed ? trimmed : area))
    .join('、');
}

/** 保存済み回答の表示用（旧データで「自由入力」のまま残っている場合の補正） */
export function formatTargetAreasStringForDisplay(areasStr: string, detail: string): string {
  const trimmed = detail.trim();
  if (!areasStr || !trimmed) return areasStr;
  return areasStr
    .split('、')
    .map((part) => (needsAreaDetail([part.trim()]) ? trimmed : part))
    .join('、');
}

function normalizeContactMethods(methods: string | readonly string[]): readonly string[] {
  if (Array.isArray(methods)) return methods;
  if (!methods) return [];
  return methods
    .split('、')
    .map((m) => m.trim())
    .filter(Boolean);
}

export function needsPhone(methods: string | readonly string[]): boolean {
  return normalizeContactMethods(methods).some((m) => m === '電話' || m === 'ショートメール');
}

export function needsEmail(methods: string | readonly string[]): boolean {
  return normalizeContactMethods(methods).some((m) => m === 'メール');
}

export async function lookupJapaneseAddress(postalCode: string): Promise<string | null> {
  const digits = postalCode.replace(/\D/g, '');
  if (digits.length !== 7) return null;
  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`);
    const json = (await res.json()) as {
      results?: Array<{ address1: string; address2: string; address3: string }>;
    };
    const row = json.results?.[0];
    if (!row) return null;
    return `${row.address1}${row.address2}${row.address3}`;
  } catch {
    return null;
  }
}
