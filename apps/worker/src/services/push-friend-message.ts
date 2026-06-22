import { extractFlexAltText } from '../utils/flex-alt-text.js';
import { buildPdfLinkFlex } from './pdf-flex-message.js';
import { LineClient } from '@line-crm/line-sdk';
import { jstNow } from '@line-crm/db';

export async function resolveFriendAccessToken(
  db: D1Database,
  friend: { line_account_id?: string | null },
  defaultToken: string,
): Promise<string> {
  const accountId = (friend as { line_account_id?: string | null }).line_account_id;
  if (!accountId) return defaultToken;
  const { getLineAccountById } = await import('@line-crm/db');
  const account = await getLineAccountById(db, accountId);
  return account?.channel_access_token ?? defaultToken;
}

/** 友だちへ LINE push（ログ記録は呼び出し元） */
export async function pushMessageToFriend(
  lineClient: LineClient,
  lineUserId: string,
  messageType: string,
  content: string,
): Promise<void> {
  if (messageType === 'text') {
    await lineClient.pushTextMessage(lineUserId, content);
  } else if (messageType === 'flex') {
    const contents = JSON.parse(content);
    await lineClient.pushFlexMessage(lineUserId, extractFlexAltText(contents), contents);
  } else if (messageType === 'image') {
    const parsed = JSON.parse(content) as {
      originalContentUrl: string;
      previewImageUrl: string;
    };
    await lineClient.pushImageMessage(
      lineUserId,
      parsed.originalContentUrl,
      parsed.previewImageUrl,
    );
  } else if (messageType === 'file') {
    const parsed = JSON.parse(content) as {
      url: string;
      fileName: string;
      expiresAtLabel?: string;
    };
    if (!parsed.url || !parsed.fileName) {
      throw new Error('Invalid file payload');
    }
    const flex = buildPdfLinkFlex(parsed.fileName, parsed.url, parsed.expiresAtLabel);
    await lineClient.pushFlexMessage(lineUserId, `${parsed.fileName}（PDF）`, flex);
  } else {
    throw new Error(`Unsupported message type: ${messageType}`);
  }
}

export async function logOutgoingFriendMessage(
  db: D1Database,
  friendId: string,
  messageType: string,
  content: string,
  source = 'manual',
): Promise<string> {
  const logId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, source, created_at)
       VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, ?, ?)`,
    )
    .bind(logId, friendId, messageType, content, source, jstNow())
    .run();
  return logId;
}
