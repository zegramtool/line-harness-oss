import { describe, expect, test } from 'vitest';
import {
  UNDO_SEND_DELAY_MS,
  isUndoSendWindow,
  normalizeScheduledAtInput,
  outgoingSourceForScheduledMessage,
  parseScheduledAtMs,
  undoSendScheduledAt,
  type UpdateScheduledMessageInput,
} from '../src/scheduled-messages.js';
import { toJstString } from '../src/utils.js';

describe('normalizeScheduledAtInput', () => {
  test('datetime-local to JST ISO', () => {
    expect(normalizeScheduledAtInput('2026-06-16T08:00')).toBe('2026-06-16T08:00:00.000+09:00');
  });

  test('passes through ISO with offset', () => {
    const iso = '2026-06-16T08:00:00.000+09:00';
    expect(normalizeScheduledAtInput(iso)).toBe(iso);
  });

  test('converts UTC Z to JST ISO', () => {
    expect(normalizeScheduledAtInput('2026-06-22T03:00:00.000Z')).toBe('2026-06-22T12:00:00.000+09:00');
  });
});

describe('parseScheduledAtMs', () => {
  test('parses datetime-local as future-capable timestamp', () => {
    const ms = parseScheduledAtMs('2026-06-16T08:00');
    expect(Number.isFinite(ms)).toBe(true);
  });
});

describe('undo send window', () => {
  test('12秒後の予約は取り消し付き即時送信と判定する', () => {
    const now = new Date('2026-08-18T06:00:00.000Z');
    const createdAt = toJstString(now);
    const scheduledAt = undoSendScheduledAt(now);
    expect(UNDO_SEND_DELAY_MS).toBe(12_000);
    expect(isUndoSendWindow(createdAt, scheduledAt)).toBe(true);
    expect(outgoingSourceForScheduledMessage(createdAt, scheduledAt)).toBe('manual');
  });

  test('数時間後の通常予約は取り消し付きにしない', () => {
    const now = new Date('2026-08-18T06:00:00.000Z');
    const createdAt = toJstString(now);
    const scheduledAt = toJstString(new Date(now.getTime() + 3 * 60 * 60_000));
    expect(isUndoSendWindow(createdAt, scheduledAt)).toBe(false);
    expect(outgoingSourceForScheduledMessage(createdAt, scheduledAt)).toBe('scheduled');
  });

  test('不正な日時は false', () => {
    expect(isUndoSendWindow('bad', 'also-bad')).toBe(false);
  });
});

describe('UpdateScheduledMessageInput', () => {
  test('allows partial update fields for content and schedule', () => {
    const input: UpdateScheduledMessageInput = {
      messageContent: '更新後の本文',
      scheduledAt: '2026-07-22T10:00',
    };
    expect(input.messageContent).toBe('更新後の本文');
    expect(normalizeScheduledAtInput(input.scheduledAt!)).toBe('2026-07-22T10:00:00.000+09:00');
  });
});
