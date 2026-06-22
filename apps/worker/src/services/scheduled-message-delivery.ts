import {
  getDueScheduledMessages,
  claimScheduledMessage,
  markScheduledMessageSent,
  markScheduledMessageFailed,
  resetScheduledMessageToPending,
  getFriendById,
  jstNow,
  updateChat,
} from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';
import {
  logOutgoingFriendMessage,
  pushMessageToFriend,
  resolveFriendAccessToken,
} from './push-friend-message.js';

/** Cron（5分毎）: 予約時刻を過ぎた個別メッセージを送信 */
export async function processScheduledMessages(
  db: D1Database,
  defaultAccessToken: string,
): Promise<void> {
  const due = await getDueScheduledMessages(db, jstNow());

  for (const item of due) {
    const claimed = await claimScheduledMessage(db, item.id);
    if (!claimed) continue;

    try {
      const friend = await getFriendById(db, item.friend_id);
      if (!friend) {
        await markScheduledMessageFailed(db, item.id, 'Friend not found');
        continue;
      }

      const accessToken = await resolveFriendAccessToken(db, friend, defaultAccessToken);
      const lineClient = new LineClient(accessToken);

      await pushMessageToFriend(
        lineClient,
        friend.line_user_id,
        item.message_type,
        item.message_content,
      );

      await logOutgoingFriendMessage(db, friend.id, item.message_type, item.message_content, 'scheduled');

      const now = jstNow();
      if (item.chat_id) {
        await updateChat(db, item.chat_id, { status: 'in_progress', lastMessageAt: now });
      }

      await markScheduledMessageSent(db, item.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('scheduled-message delivery failed:', item.id, message);
      await markScheduledMessageFailed(db, item.id, message);
    }
  }

  // sending のまま stuck した行を pending に戻す（5分以上前）
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  const stuck = await db
    .prepare(
      `SELECT id FROM scheduled_messages
       WHERE status = 'sending' AND updated_at <= ?`,
    )
    .bind(fiveMinAgo)
    .all<{ id: string }>();

  for (const row of stuck.results) {
    await resetScheduledMessageToPending(db, row.id);
  }
}
