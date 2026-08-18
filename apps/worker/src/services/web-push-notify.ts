import {
  buildPushPayload,
  type PushSubscription,
  type VapidKeys,
} from '@block65/webcrypto-web-push';
import {
  deleteWebPushSubscriptionByEndpoint,
  getUnreadFriendCount,
  getWebPushVapid,
  listWebPushSubscriptions,
  saveWebPushVapid,
} from '@line-crm/db';
import { generateVapidKeys } from './web-push-vapid.js';
import { buildDeclarativeUnreadPush, buildUnreadPushData } from './web-push-message.js';

const DEFAULT_SUBJECT = 'https://tacteq-line-admin-88e31c57.pages.dev';

export async function getOrCreateVapidKeys(
  db: D1Database,
  subject = DEFAULT_SUBJECT,
): Promise<VapidKeys> {
  const existing = await getWebPushVapid(db);
  if (existing) {
    return {
      subject: existing.subject,
      publicKey: existing.public_key,
      privateKey: existing.private_key,
    };
  }
  const generated = await generateVapidKeys();
  const saved = await saveWebPushVapid(db, {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject,
  });
  return {
    subject: saved.subject,
    publicKey: saved.public_key,
    privateKey: saved.private_key,
  };
}

export async function sendWebPush(
  subscription: PushSubscription,
  vapid: VapidKeys,
  data: ReturnType<typeof buildDeclarativeUnreadPush>,
): Promise<Response> {
  const payload = await buildPushPayload(
    { data, options: { ttl: 3600, urgency: 'high', topic: 'unread-chats' } },
    subscription,
    vapid,
  );
  return fetch(subscription.endpoint, payload);
}

export async function notifyWebPushUnread(
  db: D1Database,
  opts: { friendName?: string | null; friendId?: string | null; preview?: string | null; subject?: string; adminPublicUrl?: string } = {},
): Promise<{ sent: number; gone: number }> {
  const subscriptions = await listWebPushSubscriptions(db);
  if (subscriptions.length === 0) return { sent: 0, gone: 0 };

  const vapid = await getOrCreateVapidKeys(db, opts.subject);
  const unreadCount = await getUnreadFriendCount(db);
  const unread = buildUnreadPushData({
    unreadCount,
    friendName: opts.friendName,
    friendId: opts.friendId,
    preview: opts.preview,
  });
  const data = buildDeclarativeUnreadPush(unread, opts.adminPublicUrl || DEFAULT_SUBJECT);

  let sent = 0;
  let gone = 0;
  for (const row of subscriptions) {
    const subscription: PushSubscription = {
      endpoint: row.endpoint,
      expirationTime: null,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
    try {
      const res = await sendWebPush(subscription, vapid, data);
      if (res.status === 404 || res.status === 410) {
        await deleteWebPushSubscriptionByEndpoint(db, row.endpoint);
        gone += 1;
        continue;
      }
      if (res.ok || res.status === 201) sent += 1;
    } catch (err) {
      console.error('web push send failed', err);
    }
  }
  return { sent, gone };
}
