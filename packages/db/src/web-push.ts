import { jstNow } from './utils.js';

export interface WebPushVapidRow {
  id: number;
  public_key: string;
  private_key: string;
  subject: string;
  created_at: string;
}

export interface WebPushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  staff_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function getWebPushVapid(db: D1Database): Promise<WebPushVapidRow | null> {
  return db.prepare(`SELECT * FROM web_push_vapid WHERE id = 1`).first<WebPushVapidRow>();
}

export async function saveWebPushVapid(
  db: D1Database,
  input: { publicKey: string; privateKey: string; subject: string },
): Promise<WebPushVapidRow> {
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO web_push_vapid (id, public_key, private_key, subject, created_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         public_key = excluded.public_key,
         private_key = excluded.private_key,
         subject = excluded.subject`,
    )
    .bind(input.publicKey, input.privateKey, input.subject, now)
    .run();
  return (await getWebPushVapid(db))!;
}

export async function listWebPushSubscriptions(db: D1Database): Promise<WebPushSubscriptionRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM web_push_subscriptions ORDER BY updated_at DESC`)
    .all<WebPushSubscriptionRow>();
  return results;
}

export async function upsertWebPushSubscription(
  db: D1Database,
  input: { endpoint: string; p256dh: string; auth: string; staffId?: string | null },
): Promise<WebPushSubscriptionRow> {
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO web_push_subscriptions (id, endpoint, p256dh, auth, staff_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         staff_id = excluded.staff_id,
         updated_at = excluded.updated_at`,
    )
    .bind(crypto.randomUUID(), input.endpoint, input.p256dh, input.auth, input.staffId ?? null, now, now)
    .run();
  return (await db
    .prepare(`SELECT * FROM web_push_subscriptions WHERE endpoint = ?`)
    .bind(input.endpoint)
    .first<WebPushSubscriptionRow>())!;
}

export async function deleteWebPushSubscriptionByEndpoint(
  db: D1Database,
  endpoint: string,
): Promise<void> {
  await db.prepare(`DELETE FROM web_push_subscriptions WHERE endpoint = ?`).bind(endpoint).run();
}
