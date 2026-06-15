import { describe, expect, test } from 'vitest';
import {
  buildChatPdfPublicUrl,
  chatPdfStorageKeyFromPath,
  computeChatPdfExpiresAt,
  getChatPdfTtlDays,
  isChatPdfExpired,
} from './chat-pdf-storage.js';

describe('chat-pdf-storage', () => {
  test('getChatPdfTtlDays defaults to 30', () => {
    expect(getChatPdfTtlDays({})).toBe(30);
    expect(getChatPdfTtlDays({ CHAT_PDF_TTL_DAYS: '7' })).toBe(7);
    expect(getChatPdfTtlDays({ CHAT_PDF_TTL_DAYS: '0' })).toBe(30);
    expect(getChatPdfTtlDays({ CHAT_PDF_TTL_DAYS: '999' })).toBe(365);
  });

  test('computeChatPdfExpiresAt adds days', () => {
    const from = new Date('2026-06-14T00:00:00.000Z');
    const expires = computeChatPdfExpiresAt(7, from);
    expect(expires).toBe('2026-06-21T00:00:00.000Z');
  });

  test('isChatPdfExpired', () => {
    const now = new Date('2026-06-14T12:00:00.000Z');
    expect(isChatPdfExpired('2026-06-13T00:00:00.000Z', now)).toBe(true);
    expect(isChatPdfExpired('2026-06-15T00:00:00.000Z', now)).toBe(false);
    expect(isChatPdfExpired(undefined, now)).toBe(false);
  });

  test('chatPdfStorageKeyFromPath resolves slug URLs', () => {
    const id = 'e1765af8-38bc-415c-925e-59c5e337bce6';
    expect(chatPdfStorageKeyFromPath(`/files/${id}.pdf`)).toBe(`files/${id}.pdf`);
    expect(chatPdfStorageKeyFromPath(`/files/${id}/%E8%A6%8B%E7%A9%8D%E6%9B%B8.pdf`)).toBe(`files/${id}.pdf`);
  });

  test('buildChatPdfPublicUrl embeds filename', () => {
    const url = buildChatPdfPublicUrl('https://example.com', 'abc', '見積書.pdf');
    expect(url).toBe('https://example.com/files/abc/%E8%A6%8B%E7%A9%8D%E6%9B%B8.pdf');
  });
});
