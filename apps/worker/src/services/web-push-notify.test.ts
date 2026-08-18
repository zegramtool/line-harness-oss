import { describe, expect, test, vi } from 'vitest';
import { notifyWebPushUnread } from './web-push-notify.js';

const vapidRow = {
  id: 1,
  public_key: 'pub',
  private_key: 'priv',
  subject: 'https://example.com',
  created_at: 'now',
};

vi.mock('@line-crm/db', () => ({
  getWebPushVapid: vi.fn(),
  saveWebPushVapid: vi.fn(),
  listWebPushSubscriptions: vi.fn(),
  getUnreadFriendCount: vi.fn(),
  deleteWebPushSubscriptionByEndpoint: vi.fn(),
}));

vi.mock('./web-push-vapid.js', () => ({
  generateVapidKeys: vi.fn(),
}));

vi.mock('@block65/webcrypto-web-push', () => ({
  buildPushPayload: vi.fn().mockResolvedValue({
    method: 'post',
    headers: { ttl: '3600' },
    body: new Uint8Array([1, 2, 3]),
  }),
}));

import {
  deleteWebPushSubscriptionByEndpoint,
  getUnreadFriendCount,
  getWebPushVapid,
  listWebPushSubscriptions,
} from '@line-crm/db';

describe('notifyWebPushUnread', () => {
  test('購読が無ければ送らない', async () => {
    vi.mocked(listWebPushSubscriptions).mockResolvedValue([]);
    const result = await notifyWebPushUnread({} as D1Database);
    expect(result).toEqual({ sent: 0, gone: 0 });
  });

  test('410 なら購読を削除する', async () => {
    vi.mocked(listWebPushSubscriptions).mockResolvedValue([
      {
        id: 's1',
        endpoint: 'https://web.push.apple.com/expired',
        p256dh: 'p',
        auth: 'a',
        staff_id: null,
        created_at: 'now',
        updated_at: 'now',
      },
    ]);
    vi.mocked(getWebPushVapid).mockResolvedValue(vapidRow);
    vi.mocked(getUnreadFriendCount).mockResolvedValue(2);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 410 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await notifyWebPushUnread({} as D1Database, { friendName: '山田' });
    expect(result.gone).toBe(1);
    expect(result.sent).toBe(0);
    expect(deleteWebPushSubscriptionByEndpoint).toHaveBeenCalledWith(
      expect.anything(),
      'https://web.push.apple.com/expired',
    );
    vi.unstubAllGlobals();
  });

  test('201 なら sent を数える', async () => {
    vi.mocked(listWebPushSubscriptions).mockResolvedValue([
      {
        id: 's1',
        endpoint: 'https://web.push.apple.com/ok',
        p256dh: 'p',
        auth: 'a',
        staff_id: null,
        created_at: 'now',
        updated_at: 'now',
      },
    ]);
    vi.mocked(getWebPushVapid).mockResolvedValue(vapidRow);
    vi.mocked(getUnreadFriendCount).mockResolvedValue(1);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 201 })));

    const result = await notifyWebPushUnread({} as D1Database);
    expect(result.sent).toBe(1);
    expect(result.gone).toBe(0);
    vi.unstubAllGlobals();
  });
});
