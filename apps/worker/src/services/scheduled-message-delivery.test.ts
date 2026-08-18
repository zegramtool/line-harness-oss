import { describe, expect, test } from 'vitest';
import { outgoingSourceForScheduledMessage, toJstString, undoSendScheduledAt } from '@line-crm/db';

describe('undo send delivery source', () => {
  test('取り消し付き即時送信は manual としてログする', () => {
    const now = new Date('2026-08-18T06:00:00.000Z');
    expect(
      outgoingSourceForScheduledMessage(toJstString(now), undoSendScheduledAt(now)),
    ).toBe('manual');
  });
});
