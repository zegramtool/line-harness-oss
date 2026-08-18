import { Hono } from 'hono';
import { deleteWebPushSubscriptionByEndpoint, upsertWebPushSubscription } from '@line-crm/db';
import type { Env } from '../index.js';
import { getOrCreateVapidKeys } from '../services/web-push-notify.js';

const webPush = new Hono<Env>();

webPush.get('/api/web-push/vapid-public-key', async (c) => {
  try {
    const vapid = await getOrCreateVapidKeys(
      c.env.DB,
      c.env.ADMIN_PUBLIC_URL || c.env.WORKER_URL || 'https://tacteq-line-admin-88e31c57.pages.dev',
    );
    return c.json({ success: true, data: { publicKey: vapid.publicKey } });
  } catch (err) {
    console.error('GET /api/web-push/vapid-public-key error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webPush.post('/api/web-push/subscribe', async (c) => {
  try {
    const body = await c.req.json<{
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    }>();
    const endpoint = body.endpoint?.trim();
    const p256dh = body.keys?.p256dh?.trim();
    const auth = body.keys?.auth?.trim();
    if (!endpoint || !endpoint.startsWith('https://') || !p256dh || !auth) {
      return c.json({ success: false, error: 'Invalid subscription' }, 400);
    }
    const staff = c.get('staff');
    const row = await upsertWebPushSubscription(c.env.DB, {
      endpoint,
      p256dh,
      auth,
      staffId: staff?.id ?? null,
    });
    return c.json({ success: true, data: { id: row.id } });
  } catch (err) {
    console.error('POST /api/web-push/subscribe error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webPush.delete('/api/web-push/subscribe', async (c) => {
  try {
    const body = await c.req.json<{ endpoint?: string }>();
    const endpoint = body.endpoint?.trim();
    if (!endpoint) return c.json({ success: false, error: 'Invalid subscription' }, 400);
    await deleteWebPushSubscriptionByEndpoint(c.env.DB, endpoint);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/web-push/subscribe error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { webPush };
