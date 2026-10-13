import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Env } from '../index.js';
import { cancelJob, createPreview, getJob, latestJob, savedSummaries, startJob, stepJob } from '../services/ai-organize.js';

export const aiOrganize = new Hono<Env>();
aiOrganize.use('/api/ai-organize/*', bodyLimit({ maxSize: 4096, onError: c => c.json({ success: false, error: 'AI_REQUEST_TOO_LARGE' }, 413) }));
aiOrganize.onError((error, c) => {
  const code = /^AI_[A-Z0-9_]+$/.test(error.message) ? error.message : 'AI_STORAGE_OR_CONFIG_ERROR';
  return c.json({ success: false, error: code }, 400);
});
aiOrganize.use('/api/ai-organize/*', async (c, next) => {
  const staff = c.get('staff');
  if (!staff || !['owner', 'admin'].includes(staff.role)) return c.json({ success: false, error: '管理者権限が必要です。' }, 403);
  c.header('Cache-Control', 'no-store');
  try { await next(); }
  catch (error) {
    const code = error instanceof Error && /^AI_[A-Z0-9_]+$/.test(error.message) ? error.message : 'AI_STORAGE_OR_CONFIG_ERROR';
    // Never return/log provider bodies, raw conversations, or secrets.
    return c.json({ success: false, error: code }, 400);
  }
});
aiOrganize.get('/api/ai-organize/summaries', async c => {
  const accountId = c.req.query('accountId');
  if (!accountId) return c.json({ success: false, error: 'AI_ACCOUNT_REQUIRED' }, 400);
  return c.json({ success: true, data: { summaries: await savedSummaries(c.env.DB, accountId), job: await latestJob(c.env.DB, accountId) } });
});
aiOrganize.post('/api/ai-organize/preview', async c => {
  const body = await c.req.json<{ accountId?: string; from?: string; to?: string }>();
  if (!body.accountId || typeof body.accountId !== 'string') return c.json({ success: false, error: 'AI_ACCOUNT_REQUIRED' }, 400);
  const job = await createPreview(c.env.DB, c.env, body.accountId, c.get('staff').id, body.from, body.to);
  return c.json({ success: true, data: job });
});
aiOrganize.get('/api/ai-organize/jobs/:id', async c => {
  const account = c.req.query('accountId');
  if (!account) return c.json({ success: false, error: 'AI_ACCOUNT_REQUIRED' }, 400);
  return c.json({ success: true, data: await getJob(c.env.DB, c.req.param('id'), account) });
});
aiOrganize.post('/api/ai-organize/jobs/:id/:action', async c => {
  const body = await c.req.json<{ accountId?: string; retry?: boolean }>();
  if (!body.accountId || typeof body.accountId !== 'string') return c.json({ success: false, error: 'AI_ACCOUNT_REQUIRED' }, 400);
  const id = c.req.param('id'), action = c.req.param('action');
  const data = action === 'start' ? await startJob(c.env.DB, c.env, id, body.accountId, c.get('staff').id)
    : action === 'step' ? await stepJob(c.env.DB, c.env, id, body.accountId, body.retry === true)
    : action === 'cancel' ? await cancelJob(c.env.DB, id, body.accountId) : null;
  if (!data) return c.json({ success: false, error: 'AI_ACTION_INVALID' }, 400);
  return c.json({ success: true, data });
});
