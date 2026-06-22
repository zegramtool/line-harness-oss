import { Hono } from 'hono';
import {
  cancelScheduledMessage,
  getScheduledMessageById,
} from '@line-crm/db';
import type { Env } from '../index.js';

const scheduledMessages = new Hono<Env>();

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
