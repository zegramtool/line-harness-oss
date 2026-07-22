import { Hono } from 'hono';
import {
  cancelScheduledMessage,
  getScheduledMessageById,
  parseScheduledAtMs,
  updateScheduledMessage,
  type ScheduledMessageType,
} from '@line-crm/db';
import type { Env } from '../index.js';

const scheduledMessages = new Hono<Env>();

const MESSAGE_TYPES = new Set<ScheduledMessageType>(['text', 'image', 'flex', 'file']);

// PATCH /api/scheduled-messages/:id — 予約の日時・内容を再編集（pending のみ）
scheduledMessages.patch('/api/scheduled-messages/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await getScheduledMessageById(c.env.DB, id);
    if (!existing) return c.json({ success: false, error: 'Not found' }, 404);
    if (existing.status !== 'pending') {
      return c.json({ success: false, error: 'Only pending messages can be updated' }, 400);
    }

    const body = await c.req.json<{
      content?: string;
      messageType?: string;
      scheduledAt?: string;
      altText?: string | null;
    }>();

    const hasContent = typeof body.content === 'string';
    const hasType = typeof body.messageType === 'string';
    const hasScheduledAt = typeof body.scheduledAt === 'string' && body.scheduledAt.trim().length > 0;
    const hasAltText = body.altText !== undefined;

    if (!hasContent && !hasType && !hasScheduledAt && !hasAltText) {
      return c.json(
        { success: false, error: 'At least one of content, messageType, scheduledAt is required' },
        400,
      );
    }

    if (hasContent && !body.content!.trim()) {
      return c.json({ success: false, error: 'content must not be empty' }, 400);
    }

    if (hasType && !MESSAGE_TYPES.has(body.messageType as ScheduledMessageType)) {
      return c.json({ success: false, error: 'Invalid messageType' }, 400);
    }

    let nextScheduledAt: string | undefined;
    if (hasScheduledAt) {
      const scheduledMs = parseScheduledAtMs(body.scheduledAt!);
      if (!Number.isFinite(scheduledMs)) {
        return c.json({ success: false, error: 'Invalid scheduledAt' }, 400);
      }
      if (scheduledMs <= Date.now()) {
        return c.json({ success: false, error: 'scheduledAt must be in the future' }, 400);
      }
      nextScheduledAt = body.scheduledAt!.trim();
    }

    const updated = await updateScheduledMessage(c.env.DB, id, {
      messageContent: hasContent ? body.content!.trim() : undefined,
      messageType: hasType ? (body.messageType as ScheduledMessageType) : undefined,
      scheduledAt: nextScheduledAt,
      altText: hasAltText ? body.altText : undefined,
    });

    if (!updated) {
      return c.json({ success: false, error: 'Update failed (message may no longer be pending)' }, 400);
    }

    return c.json({
      success: true,
      data: {
        id: updated.id,
        friendId: updated.friend_id,
        messageType: updated.message_type,
        messageContent: updated.message_content,
        scheduledAt: updated.scheduled_at,
        status: updated.status,
        createdAt: updated.created_at,
      },
    });
  } catch (err) {
    console.error('PATCH scheduled-messages error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/scheduled-messages/:id — 予約取消
scheduledMessages.delete('/api/scheduled-messages/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await getScheduledMessageById(c.env.DB, id);
    if (!existing) return c.json({ success: false, error: 'Not found' }, 404);
    if (existing.status !== 'pending') {
      return c.json({ success: false, error: 'Only pending messages can be cancelled' }, 400);
    }

    const ok = await cancelScheduledMessage(c.env.DB, id);
    if (!ok) return c.json({ success: false, error: 'Cancel failed' }, 400);
    return c.json({ success: true, data: { id, status: 'cancelled' } });
  } catch (err) {
    console.error('DELETE scheduled-messages error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { scheduledMessages };
