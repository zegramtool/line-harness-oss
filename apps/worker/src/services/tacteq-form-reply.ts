import type { Message } from '@line-crm/line-sdk';
import { formatTargetAreasStringForDisplay } from '../client/tacteq-inquiry-fields.js';
import { buildPdfLinkFlex } from './pdf-flex-message.js';
import { buildMessage } from './step-delivery.js';

export const TACTEQ_ESTIMATE_PHOTO_GUIDE_R2_KEY = 'welcome-estimate-photo-guide.png';

/** 期限なし固定キー（チャットPDFの files/ 配下ではない） */
export const TACTEQ_REPAIR_FLOW_PDF_R2_KEY = 'tacteq-repair-flow.pdf';
export const TACTEQ_REPAIR_FLOW_PDF_FILE_NAME = '傷リペアの作業の流れ.pdf';

/** この相談種別のとき、作業フロー PDF を自動送信する */
export const TACTEQ_REPAIR_FLOW_PDF_CONSULTATION_TYPES = ['傷の修繕', '劣化の修繕'] as const;

export function shouldSendRepairFlowPdf(consultationType: unknown): boolean {
  const value = String(consultationType ?? '').trim();
  return (TACTEQ_REPAIR_FLOW_PDF_CONSULTATION_TYPES as readonly string[]).includes(value);
}

export const TACTEQ_FIELD_LABELS: Record<string, string> = {
  consultation_type: '今回のご相談',
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
  budget_sense: 'ご予算感',
  first_time_repair: 'お見積り・リペアは初めて',
  noticed_since: '気になり始めた時期',
  contact_method: 'ご希望の連絡手段',
  phone: 'お電話番号',
  email: 'メールアドレス',
  fire_insurance: '火災保険の使用',
  privacy_consent: '個人情報同意',
};

const FIELD_ORDER = [
  'consultation_type',
  'target_areas',
  'target_area_detail',
  'customer_type',
  'housing_type',
  'damage_cause',
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
  'budget_sense',
  'first_time_repair',
  'noticed_since',
  'contact_method',
  'phone',
  'email',
  'fire_insurance',
] as const;

export const PHOTO_REQUEST_TEXT = `お問い合わせありがとうございます。受け付けました。

続いて、お見積り用の写真（①アップ ②約50cm ③全景）をこのLINEに送ってください。
動画を送っていただけると状況がより分かりやすく、大変ありがたいです。
👇参考画像の通りに撮影をお願いいたします。`;

/** 傷・劣化相談時、作業フロー PDF の直前に送る案内文 */
export const REPAIR_FLOW_INTRO_TEXT = '作業の流れはこちらです。';

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.join('、');
  return String(value);
}

function normalizeSubmissionData(data: Record<string, unknown>): Record<string, unknown> {
  const detail = String(data.target_area_detail ?? '').trim();
  if (!detail || data.target_areas === undefined || data.target_areas === null) return data;

  const areasStr = String(data.target_areas);
  const normalizedAreas = formatTargetAreasStringForDisplay(areasStr, detail);
  const mergedIntoAreas = normalizedAreas !== areasStr;

  return {
    ...data,
    target_areas: normalizedAreas,
    ...(mergedIntoAreas ? { target_area_detail: undefined } : {}),
  };
}

function buildSummaryRows(data: Record<string, unknown>) {
  const normalized = normalizeSubmissionData(data);
  const rows: Array<{ label: string; value: string }> = [];
  for (const key of FIELD_ORDER) {
    const value = normalized[key];
    if (value === undefined || value === null || value === '') continue;
    rows.push({
      label: TACTEQ_FIELD_LABELS[key] ?? key,
      value: formatValue(value),
    });
  }
  return rows;
}

function buildInquirySummaryFlex(displayName: string, data: Record<string, unknown>) {
  const rows = buildSummaryRows(data);

  // 1行1項目のコンパクト表示で全項目を1枚の Flex に収める
  const answerRows = rows.map((row) => ({
    type: 'box' as const,
    layout: 'vertical' as const,
    margin: 'sm' as const,
    contents: [
      {
        type: 'text' as const,
        text: `${row.label}\n${row.value}`,
        size: 'xs' as const,
        color: '#333333',
        wrap: true,
      },
    ],
  }));

  const titleName = String(data.customer_name ?? displayName ?? '');

  return {
    type: 'bubble',
    size: 'giga',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'お問い合わせ内容', size: 'lg', weight: 'bold', color: '#333333' },
        {
          type: 'text',
          text: titleName ? `${titleName} 様` : '送信内容',
          size: 'xs',
          color: '#888888',
          margin: 'sm',
        },
      ],
      paddingAll: '16px',
      backgroundColor: '#FFF5E6',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: answerRows,
      paddingAll: '16px',
    },
  };
}

/** TacTeQ フォーム送信後にトークへ送るメッセージ群 */
export function buildTacteqFormReplyMessages(opts: {
  displayName: string;
  submissionData: Record<string, unknown>;
  workerPublicUrl: string;
}): Message[] {
  const baseUrl = opts.workerPublicUrl.replace(/\/$/, '');
  const imageUrl = `${baseUrl}/images/${TACTEQ_ESTIMATE_PHOTO_GUIDE_R2_KEY}`;
  const flex = buildInquirySummaryFlex(opts.displayName, opts.submissionData);

  const messages: Message[] = [
    buildMessage('flex', JSON.stringify(flex), 'お問い合わせ内容'),
  ];

  // 写真撮影のお願い → 撮影見本画像
  messages.push(buildMessage('text', PHOTO_REQUEST_TEXT));
  messages.push(
    buildMessage('image', JSON.stringify({ originalContentUrl: imageUrl, previewImageUrl: imageUrl })),
  );

  // 傷・劣化の相談時は、写真依頼の直後に案内テキスト＋作業フロー PDF を追加
  if (shouldSendRepairFlowPdf(opts.submissionData.consultation_type)) {
    const pdfUrl = `${baseUrl}/images/${TACTEQ_REPAIR_FLOW_PDF_R2_KEY}`;
    const pdfFlex = buildPdfLinkFlex(TACTEQ_REPAIR_FLOW_PDF_FILE_NAME, pdfUrl);
    messages.push(buildMessage('text', REPAIR_FLOW_INTRO_TEXT));
    messages.push(buildMessage('flex', JSON.stringify(pdfFlex), `${TACTEQ_REPAIR_FLOW_PDF_FILE_NAME}（PDF）`));
  }

  return messages;
}
