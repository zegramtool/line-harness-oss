import { describe, expect, test } from 'vitest';
import {
  buildTacteqFormReplyMessages,
  shouldSendRepairFlowPdf,
  TACTEQ_REPAIR_FLOW_PDF_R2_KEY,
} from './tacteq-form-reply.js';

describe('shouldSendRepairFlowPdf', () => {
  test('傷の修繕 / 劣化の修繕 で true', () => {
    expect(shouldSendRepairFlowPdf('傷の修繕')).toBe(true);
    expect(shouldSendRepairFlowPdf('劣化の修繕')).toBe(true);
  });

  test('その他の相談では false', () => {
    expect(shouldSendRepairFlowPdf('リフォーム')).toBe(false);
    expect(shouldSendRepairFlowPdf('床鳴り')).toBe(false);
    expect(shouldSendRepairFlowPdf('塗装')).toBe(false);
    expect(shouldSendRepairFlowPdf('')).toBe(false);
    expect(shouldSendRepairFlowPdf(undefined)).toBe(false);
  });
});

describe('buildTacteqFormReplyMessages', () => {
  const base = {
    displayName: '山田',
    workerPublicUrl: 'https://example.workers.dev',
  };

  test('傷の修繕では PDF Flex を含めて 4 通', () => {
    const messages = buildTacteqFormReplyMessages({
      ...base,
      submissionData: {
        consultation_type: '傷の修繕',
        customer_name: '山田',
        city: '岡崎市',
      },
    });
    expect(messages).toHaveLength(4);
    expect(messages[0].type).toBe('flex');
    expect(messages[1].type).toBe('flex');
    expect(messages[2].type).toBe('text');
    expect(messages[3].type).toBe('image');
    const pdfFlex = JSON.stringify(messages[1]);
    expect(pdfFlex).toContain(TACTEQ_REPAIR_FLOW_PDF_R2_KEY);
    expect(pdfFlex).toContain('/images/tacteq-repair-flow.pdf');
    expect(pdfFlex).toContain('PDFを開く');
  });

  test('劣化の修繕でも PDF Flex を含む', () => {
    const messages = buildTacteqFormReplyMessages({
      ...base,
      submissionData: { consultation_type: '劣化の修繕' },
    });
    expect(messages).toHaveLength(4);
    expect(JSON.stringify(messages[1])).toContain('tacteq-repair-flow.pdf');
  });

  test('リフォームでは PDF なしの 3 通', () => {
    const messages = buildTacteqFormReplyMessages({
      ...base,
      submissionData: { consultation_type: 'リフォーム' },
    });
    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.type)).toEqual(['flex', 'text', 'image']);
    expect(JSON.stringify(messages)).not.toContain('tacteq-repair-flow.pdf');
  });
});
