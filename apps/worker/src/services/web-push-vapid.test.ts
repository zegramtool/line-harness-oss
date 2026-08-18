import { describe, expect, test } from 'vitest';
import { buildUnreadPushData } from './web-push-message.js';
import { generateVapidKeys, vapidPublicKeyBytes } from './web-push-vapid.js';

describe('buildUnreadPushData', () => {
  test('1件なら件数を本文に出さない', () => {
    expect(buildUnreadPushData({ unreadCount: 1, friendName: '山田' })).toEqual({
      unreadCount: 1,
      title: '未読のチャット',
      body: '山田からメッセージ',
      url: '/chats/',
    });
  });

  test('2件以上なら件数を添える', () => {
    expect(buildUnreadPushData({ unreadCount: 3, friendName: '山田' }).body).toBe(
      '山田からメッセージ（未読 3 件）',
    );
  });

  test('名前が空ならお客さま', () => {
    expect(buildUnreadPushData({ unreadCount: 1, friendName: '  ' }).body).toBe(
      'お客さまからメッセージ',
    );
  });
});

describe('generateVapidKeys', () => {
  test('非圧縮 P-256 公開鍵 (65 bytes) を返す', async () => {
    const keys = await generateVapidKeys();
    const raw = vapidPublicKeyBytes(keys.publicKey);
    expect(raw.byteLength).toBe(65);
    expect(raw[0]).toBe(0x04);
    expect(keys.privateKey.length).toBeGreaterThan(20);
  });
});
