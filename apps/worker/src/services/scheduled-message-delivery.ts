import {
  getDueScheduledMessages,
  claimScheduledMessage,
  markScheduledMessageSent,
  markScheduledMessageFailed,
  resetScheduledMessageToPending,
  getFriendById,
  getScheduledMessageById,
  jstNow,
  updateChat,
  outgoingSourceForScheduledMessage,
  type ScheduledMessageRow,
} from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';
import {
  logOutgoingFriendMessage,
  logOutgoingFriendImages,
  parseImagePayloads,
  pushMessageToFriend,
  resolveFriendAccessToken,
} from './push-friend-message.js';

export type DeliverScheduledResult = 'sent' | 'skipped' | 'failed';

export async function sleepMs(ms: number): Promise<void> {
  const wait = (globalThis as { scheduler?: { wait?: (n: number) => Promise<void> } }).scheduler?.wait;
  if (typeof wait === 'function') {
    await wait(ms);
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function sendScheduledRow(
  db: D1Database,
  defaultAccessToken: string,
  item: ScheduledMessageRow,
): Promise<void> {
  const friend = await getFriendById(db, item.friend_id);
  if (!friend) {
    throw new Error('Friend not found');
  }

  const accessToken = await resolveFriendAccessToken(db, friend, defaultAccessToken);
  const lineClient = new LineClient(accessToken);

  await pushMessageToFriend(
    lineClient,
    friend.line_user_id,
    item.message_type,
    item.message_content,
  );

  const source = outgoingSourceForScheduledMessage(item.created_at, item.scheduled_at);
  if (item.message_type === 'image') {
    const images = parseImagePayloads(item.message_content);
    await logOutgoingFriendImages(db, friend.id, images, source);
  } else {
    await logOutgoingFriendMessage(db, friend.id, item.message_type, item.message_content, source);
  }

  const now = jstNow();
  if (item.chat_id) {
    await updateChat(db, item.chat_id, { status: 'in_progress', lastMessageAt: now });
  }

  await markScheduledMessageSent(db, item.id);
}

/** 1件を claim して LINE 送信。取消済み・他経路が先に claim したら skipped。 */
export async function deliverScheduledMessageById(
  db: D1Database,
  defaultAccessToken: string,
  id: string,
): Promise<DeliverScheduledResult> {
  const item = await getScheduledMessageById(db, id);
  if (!item) return 'skipped';
  if (item.status === 'sent') return 'sent';
  if (item.status !== 'pending') return 'skipped';

  const claimed = await claimScheduledMessage(db, id);
  if (!claimed) {
    const again = await getScheduledMessageById(db, id);
    return again?.status === 'sent' ? 'sent' : 'skipped';
  }

  try {
    await sendScheduledRow(db, defaultAccessToken, item);
    return 'sent';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('scheduled-message delivery failed:', id, message);
    await markScheduledMessageFailed(db, id, message);
    return 'failed';
  }
}

export async function delayThenDeliverScheduledMessage(
  db: D1Database,
  defaultAccessToken: string,
  id: string,
  delayMs: number,
): Promise<DeliverScheduledResult> {
  await sleepMs(delayMs);
  return deliverScheduledMessageById(db, defaultAccessToken, id);
}

/** Cron（5分毎）: 予約時刻を過ぎた個別メッセージを送信 */
export async function processScheduledMessages(
  db: D1Database,
  defaultAccessToken: string,
): Promise<void> {
  const due = await getDueScheduledMessages(db, jstNow());

  for (const item of due) {
    await deliverScheduledMessageById(db, defaultAccessToken, item.id);
  }

  // sending のまま stuck した行を pending に戻す（5分以上前）
  const fiveMinAgo = new Date(Date.now() + 9 * 60 * 60_000 - 5 * 60_000);
  const stuckThreshold = fiveMinAgo.toISOString().slice(0, -1) + '+09:00';
  const stuck = await db
    .prepare(
      `SELECT id FROM scheduled_messages
       WHERE status = 'sending' AND updated_at <= ?`,
    )
    .bind(stuckThreshold)
    .all<{ id: string }>();

  for (const row of stuck.results) {
    await resetScheduledMessageToPending(db, row.id);
  }
}
