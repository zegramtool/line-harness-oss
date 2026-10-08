import type { AiOrganizeEstimate, AiOrganizeJob, AiOrganizeSummary } from '@line-crm/shared';
import {
  aiSettings, boundedChunk, callCap, inputBound, MAX_ATTEMPTS, MAX_CONVERSATIONS, MAX_INPUT_BYTES,
  MAX_MESSAGES, MAX_OUTPUT_TOKENS, parseResponse, readBoundedResponse, requestFor, SECTIONS, validateSummary,
  type AiBindings, type AiInput, type AiSettings,
} from './ai-organize-model.js';

type JobRow = {
  id: string; account_id: string; created_by: string; status: AiOrganizeJob['status'];
  expires_at: string; period: string; config_json: string; estimate_json: string; reserve_microusd: number;
};
type ItemRow = {
  id: string; friend_id: string; display_name: string | null; status: AiOrganizeJob['items'][number]['status'];
  attempts: number; cap_microusd: number; charged_microusd: number; input_json: string;
  lease_token: string | null; lease_until: string | null; result_json: string | null; usage_json: string; error_code: string | null;
};
type SummaryRow = { friend_id: string; cursor_rowid: number; version: number; period_start: string; summary_json: string };

// Legacy messages without an offset were written in JST. Explicit offsets and Z
// retain their actual instant. rowid orders ingestion, including backfilled dates.
const MESSAGE_INSTANT = `(julianday(m.created_at) - CASE WHEN m.created_at LIKE '%Z' OR substr(m.created_at,-6,1) IN ('+','-') THEN 0 ELSE 9.0/24 END)`;
const HUMAN_TEXT = `(m.message_type='text' AND ((m.direction='incoming' AND COALESCE(m.source,'user') NOT IN ('postback','inbox_ack')) OR (m.direction='outgoing' AND m.source IN ('manual','csv_import'))))`;
const nowIso = () => new Date().toISOString();
export function validatePeriod(from: unknown, to: unknown) {
  if (typeof from !== 'string' || typeof to !== 'string' || !/[Zz]|[+-]\d\d:\d\d$/.test(from) || !/[Zz]|[+-]\d\d:\d\d$/.test(to)) throw new Error('AI_PERIOD_INVALID');
  const start = new Date(from), end = new Date(to);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end ||
      end.getTime() - start.getTime() > 366 * 86400_000 || end.getTime() > Date.now() + 60_000) throw new Error('AI_PERIOD_INVALID');
  return { from: start.toISOString(), to: end.toISOString() };
}
function messageText(content: string): string {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && 'text' in parsed && typeof parsed.text === 'string') return parsed.text;
    if (typeof parsed === 'string') return parsed;
    return ''; // Unexpected JSON metadata is not conversation text.
  } catch { /* Historical imports store plain text. */ }
  return content;
}

export async function createPreview(db: D1Database, env: AiBindings, accountId: string, actor: string, from: unknown, to: unknown): Promise<AiOrganizeJob> {
  const period = validatePeriod(from, to);
  const settings = aiSettings(env);
  if (!await db.prepare('SELECT id FROM line_accounts WHERE id=?').bind(accountId).first()) throw new Error('AI_ACCOUNT_NOT_FOUND');
  const watermark = await db.prepare('SELECT COALESCE(MAX(rowid),0) AS value FROM messages_log').first<{ value: number }>();
  // Select all conversations with new human text, not just the unreplied inbox.
  // Oldest unsummarized ingestion first prevents a busy friend starving others.
  const candidates = await db.prepare(`
    SELECT f.id, f.display_name, s.cursor_rowid, s.version, s.period_start, s.summary_json, MIN(m.rowid) AS first_new
    FROM friends f
    LEFT JOIN ai_organize_summaries s ON s.account_id=f.line_account_id AND s.friend_id=f.id
    CROSS JOIN messages_log m INDEXED BY ai_organize_messages_friend_instant
    WHERE m.friend_id=f.id AND f.line_account_id=? AND m.rowid<=?
      AND NOT EXISTS(SELECT 1 FROM ai_organize_processed p WHERE p.account_id=f.line_account_id AND p.friend_id=f.id AND p.message_id=m.id)
      AND (m.line_account_id IS NULL OR m.line_account_id=f.line_account_id)
      AND ${HUMAN_TEXT}
      AND ${MESSAGE_INSTANT} >= julianday(COALESCE(s.period_start,?))
      AND ${MESSAGE_INSTANT} < julianday(?)
    GROUP BY f.id ORDER BY first_new LIMIT ?
  `).bind(accountId, watermark?.value ?? 0, period.from, period.to, MAX_CONVERSATIONS + 1)
    .all<{ id: string; display_name: string | null; cursor_rowid: number | null; version: number | null; period_start: string | null; summary_json: string | null }>();
  const chunks: Array<{ id: string; name: string | null; input: AiInput; cap: number }> = [];
  let more = candidates.results.length > MAX_CONVERSATIONS;
  for (const friend of candidates.results.slice(0, MAX_CONVERSATIONS)) {
    const start = friend.period_start ?? period.from;
    const rows = await db.prepare(`
      SELECT m.rowid AS rowid,m.id,m.direction,m.source,m.content,m.created_at
      FROM messages_log m INDEXED BY ai_organize_messages_friend_instant WHERE m.friend_id=? AND (m.line_account_id IS NULL OR m.line_account_id=?)
        AND m.rowid<=? AND ${HUMAN_TEXT}
        AND NOT EXISTS(SELECT 1 FROM ai_organize_processed p WHERE p.account_id=? AND p.friend_id=m.friend_id AND p.message_id=m.id)
        AND ${MESSAGE_INSTANT} >= julianday(?) AND ${MESSAGE_INSTANT} < julianday(?)
      ORDER BY m.rowid LIMIT ?
    `).bind(friend.id, accountId, watermark?.value ?? 0, accountId, start, period.to, MAX_MESSAGES + 1)
      .all<{ rowid: number; id: string; direction: string; source: string | null; content: string; created_at: string }>();
    if (!rows.results.length) continue;
    const input: AiInput = {
      friendId: friend.id, from: start, to: period.to, cursor: friend.cursor_rowid ?? 0, baseCursor: friend.version ?? 0,
      previous: friend.summary_json ? JSON.parse(friend.summary_json) as AiOrganizeSummary : null,
      messages: rows.results.map(m => ({ id: m.id, rowid: m.rowid, at: m.created_at, direction: m.direction, source: m.source, text: messageText(m.content) })),
    };
    const chunk = boundedChunk(input, settings);
    more ||= chunk.more;
    const cap = callCap(chunk.input, settings);
    // Reserve the maximum charge for both attempts, including a manual retry.
    if ((chunks.reduce((sum, c) => sum + c.cap, 0) + cap) * MAX_ATTEMPTS > settings.jobLimit) {
      more = true; break;
    }
    chunks.push({ id: friend.id, name: friend.display_name, input: chunk.input, cap });
  }
  const capTotal = chunks.reduce((sum, c) => sum + c.cap, 0);
  if (candidates.results.length && !chunks.length) throw new Error('AI_JOB_BUDGET_TOO_SMALL');
  const estimate: AiOrganizeEstimate = {
    conversations: chunks.length, messages: chunks.reduce((sum, c) => sum + c.input.messages.length, 0), moreAvailable: more,
    boundedInputTokens: chunks.reduce((sum, c) => sum + inputBound(c.input, settings), 0),
    maxOutputTokensPerCall: MAX_OUTPUT_TOKENS, maxAttempts: MAX_ATTEMPTS,
    estimatedUsd: capTotal / 1_000_000, reservedUsd: capTotal * MAX_ATTEMPTS / 1_000_000,
    perJobLimitUsd: settings.jobLimit / 1_000_000, monthlyLimitUsd: settings.monthLimit / 1_000_000,
    model: settings.model, configured: settings.enabled, ...period,
  };
  const id = crypto.randomUUID(), now = nowIso();
  await db.batch([
    db.prepare(`UPDATE ai_organize_jobs SET status='cancelled' WHERE account_id=? AND created_by=? AND status='preview'`).bind(accountId, actor),
    db.prepare(`UPDATE ai_organize_items SET input_json='' WHERE job_id IN
      (SELECT id FROM ai_organize_jobs WHERE account_id=? AND created_by=? AND status='cancelled')`).bind(accountId, actor),
    db.prepare(`INSERT INTO ai_organize_jobs(id,account_id,created_by,status,created_at,expires_at,period,config_json,estimate_json,reserve_microusd)
      VALUES(?,?,?,'preview',?,?,?,?,?,?)`).bind(id, accountId, actor, now, new Date(Date.now() + 30 * 60_000).toISOString(), now.slice(0, 7), JSON.stringify(settings), JSON.stringify(estimate), capTotal * MAX_ATTEMPTS),
    ...chunks.map((chunk, ordinal) => db.prepare(`INSERT INTO ai_organize_items(id,job_id,friend_id,display_name,ordinal,input_json,cap_microusd)
      VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), id, chunk.id, chunk.name, ordinal, JSON.stringify(chunk.input), chunk.cap)),
  ]);
  return getJob(db, id, accountId);
}

async function jobRow(db: D1Database, id: string, accountId: string): Promise<JobRow> {
  const row = await db.prepare('SELECT * FROM ai_organize_jobs WHERE id=? AND account_id=?').bind(id, accountId).first<JobRow>();
  if (!row) throw new Error('AI_JOB_NOT_FOUND');
  return row;
}
export async function getJob(db: D1Database, id: string, accountId: string): Promise<AiOrganizeJob> {
  const job = await jobRow(db, id, accountId);
  const items = await db.prepare(`SELECT id,friend_id,display_name,status,attempts,error_code,charged_microusd,usage_json,result_json
    FROM ai_organize_items WHERE job_id=? ORDER BY ordinal`).bind(id).all<ItemRow>();
  return {
    id, accountId, status: job.status, expiresAt: job.expires_at, estimate: JSON.parse(job.estimate_json) as AiOrganizeEstimate,
    items: items.results.map(item => ({
      id: item.id, friendId: item.friend_id, displayName: item.display_name, status: item.status, attempts: item.attempts,
      errorCode: item.error_code, chargedUsd: item.charged_microusd / 1_000_000,
      usage: JSON.parse(item.usage_json) as unknown[], summary: item.result_json ? JSON.parse(item.result_json) as AiOrganizeSummary : null,
    })),
  };
}
export async function latestJob(db: D1Database, accountId: string): Promise<AiOrganizeJob | null> {
  const row = await db.prepare(`SELECT id FROM ai_organize_jobs WHERE account_id=? AND status!='preview' ORDER BY CASE WHEN status='ready' THEN 0 ELSE 1 END,created_at DESC LIMIT 1`).bind(accountId).first<{ id: string }>();
  return row ? getJob(db, row.id, accountId) : null;
}
export async function startJob(db: D1Database, env: AiBindings, id: string, accountId: string, actor: string) {
  const settings = aiSettings(env);
  if (!settings.enabled) throw new Error('AI_NOT_ENABLED');
  const job = await jobRow(db, id, accountId);
  if (job.status === 'ready') return getJob(db, id, accountId); // Idempotent start.
  if (job.status !== 'preview' || job.created_by !== actor || job.expires_at < nowIso() || job.period !== nowIso().slice(0, 7)) throw new Error('AI_PREVIEW_EXPIRED');
  if (JSON.stringify(settings) !== job.config_json) throw new Error('AI_CONFIG_CHANGED');
  if (!job.reserve_microusd || job.reserve_microusd > settings.jobLimit) throw new Error('AI_JOB_BUDGET_TOO_SMALL');
  // The preview is a snapshot. Never replace a newer saved summary with it.
  const items = await db.prepare('SELECT input_json FROM ai_organize_items WHERE job_id=?').bind(id).all<{ input_json: string }>();
  for (const row of items.results) {
    const input = JSON.parse(row.input_json) as AiInput;
    const previous = await db.prepare('SELECT version FROM ai_organize_summaries WHERE account_id=? AND friend_id=?').bind(accountId, input.friendId).first<{ version: number }>();
    if ((previous?.version ?? 0) !== input.baseCursor) throw new Error('AI_PREVIEW_STALE');
  }
  try {
    await db.batch([
      db.prepare(`INSERT INTO ai_organize_budgets(period,limit_microusd) VALUES(?,?)
        ON CONFLICT(period) DO UPDATE SET limit_microusd=excluded.limit_microusd`).bind(job.period, settings.monthLimit),
      db.prepare(`UPDATE ai_organize_jobs SET status='ready',expires_at=? WHERE id=? AND status='preview'`).bind(new Date(Date.now() + 24 * 3600_000).toISOString(), id),
    ]);
  } catch { throw new Error('AI_BUDGET_OR_CONCURRENCY_LIMIT'); }
  return getJob(db, id, accountId);
}

export async function cancelJob(db: D1Database, id: string, accountId: string) {
  await jobRow(db, id, accountId);
  await db.batch([
    db.prepare(`UPDATE ai_organize_jobs SET status='cancelled' WHERE id=? AND account_id=? AND status IN ('preview','ready')`).bind(id, accountId),
    db.prepare(`UPDATE ai_organize_items SET input_json='',lease_token=NULL,lease_until=NULL,
      status=CASE WHEN status='done' THEN 'done' ELSE 'failed' END,
      error_code=CASE WHEN status='done' THEN NULL ELSE COALESCE(error_code,'AI_CANCELLED') END
      WHERE job_id=? AND EXISTS(SELECT 1 FROM ai_organize_jobs WHERE id=? AND status='cancelled')`).bind(id, id),
  ]);
  return getJob(db, id, accountId);
}
export async function savedSummaries(db: D1Database, accountId: string) {
  const rows = await db.prepare(`SELECT s.*,f.display_name FROM ai_organize_summaries s JOIN friends f ON f.id=s.friend_id
    WHERE s.account_id=? AND f.line_account_id=? ORDER BY s.updated_at DESC LIMIT 100`).bind(accountId, accountId)
    .all<SummaryRow & { display_name: string | null; updated_at: string; covered_until: string }>();
  return rows.results.map(s => ({ friendId: s.friend_id, displayName: s.display_name, updatedAt: s.updated_at, from: s.period_start, to: s.covered_until, summary: JSON.parse(s.summary_json) as AiOrganizeSummary }));
}

// One bounded conversation per user-driven request. No cron or webhook calls this.
export async function stepJob(db: D1Database, env: AiBindings, id: string, accountId: string, retry: boolean, fetcher: typeof fetch = fetch) {
  const settings = aiSettings(env);
  if (!settings.enabled) throw new Error('AI_NOT_ENABLED');
  const job = await jobRow(db, id, accountId);
  if (job.status !== 'ready') throw new Error('AI_JOB_NOT_READY');
  if (job.expires_at < nowIso() || job.period !== nowIso().slice(0, 7)) { await cancelJob(db, id, accountId); throw new Error('AI_JOB_EXPIRED'); }
  if (job.config_json !== JSON.stringify(settings)) throw new Error('AI_CONFIG_CHANGED');
  const now = nowIso();
  // A crashed request's attempt was already charged at the full reserved cap.
  await db.prepare(`UPDATE ai_organize_items SET status='failed',error_code='AI_INTERRUPTED',lease_token=NULL
    WHERE job_id=? AND status='processing' AND lease_until<?`).bind(id, now).run();
  if (await db.prepare(`SELECT id FROM ai_organize_items WHERE job_id=? AND status='processing'`).bind(id).first()) return getJob(db, id, accountId);
  if (!retry && await db.prepare(`SELECT id FROM ai_organize_items WHERE job_id=? AND status='failed'`).bind(id).first()) return getJob(db, id, accountId);
  const item = await db.prepare(`SELECT * FROM ai_organize_items WHERE job_id=? AND attempts<?
    AND status IN (${retry ? "'pending','failed'" : "'pending'"}) ORDER BY ordinal LIMIT 1`).bind(id, MAX_ATTEMPTS).first<ItemRow>();
  if (!item) return getJob(db, id, accountId);
  const input = JSON.parse(item.input_json) as AiInput;
  const friend = await db.prepare('SELECT id FROM friends WHERE id=? AND line_account_id=?').bind(input.friendId, accountId).first();
  const baseline = await db.prepare('SELECT version FROM ai_organize_summaries WHERE account_id=? AND friend_id=?').bind(accountId, input.friendId).first<{ version: number }>();
  if (!friend || (baseline?.version ?? 0) !== input.baseCursor) throw new Error('AI_PREVIEW_STALE');
  if (inputBound(input, settings) > MAX_INPUT_BYTES || callCap(input, settings) !== item.cap_microusd) throw new Error('AI_INPUT_LIMIT');
  const lease = crypto.randomUUID();
  // Compare-and-set claim; DB is the lock across browsers/Worker isolates.
  const claimed = await db.prepare(`UPDATE ai_organize_items SET status='processing',attempts=attempts+1,
    lease_token=?,lease_until=?,charged_microusd=charged_microusd+cap_microusd,error_code=NULL
    WHERE id=? AND status=? AND attempts=? AND EXISTS(SELECT 1 FROM ai_organize_jobs WHERE id=? AND status='ready')
      AND NOT EXISTS(SELECT 1 FROM ai_organize_items WHERE job_id=? AND status='processing')`)
    .bind(lease, new Date(Date.now() + 120_000).toISOString(), item.id, item.status, item.attempts, id, id).run();
  if (!claimed.meta.changes) return getJob(db, id, accountId);
  let usageRecord: unknown = { uncertain: true, chargedMicrousd: item.cap_microusd };
  try {
    const response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestFor(input, settings)), signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`AI_PROVIDER_HTTP_${response.status}`); }
    const parsed = parseResponse(await readBoundedResponse(response));
    // Output usage includes reasoning tokens. No cache rebate is assumed.
    const cost = Math.ceil(parsed.usage.input_tokens * settings.inputPrice + parsed.usage.output_tokens * settings.outputPrice);
    if (cost > item.cap_microusd || parsed.usage.input_tokens > inputBound(input, settings) || parsed.usage.output_tokens > MAX_OUTPUT_TOKENS) throw new Error('AI_USAGE_EXCEEDED_BOUND');
    usageRecord = { ...parsed.usage, conservativeMicrousd: cost, chargedMicrousd: cost };
    const summary = validateSummary(parsed.value, input);
    const refs = [...new Set(SECTIONS.flatMap(key => summary[key].flatMap(entry => entry.evidence.map(e => e.id))))];
    if (refs.length) {
      const found = await db.prepare(`SELECT m.id FROM messages_log m JOIN friends f ON f.id=m.friend_id
        WHERE m.friend_id=? AND f.line_account_id=? AND (m.line_account_id IS NULL OR m.line_account_id=?)
          AND m.id IN (${refs.map(() => '?').join(',')})`).bind(input.friendId, accountId, accountId, ...refs).all<{ id: string }>();
      if (found.results.length !== refs.length) throw new Error('AI_EVIDENCE_INVALID');
    }
    const json = JSON.stringify(summary);
    await db.batch([
      db.prepare(`INSERT INTO ai_organize_summaries(account_id,friend_id,cursor_rowid,version,period_start,covered_until,summary_json,updated_at)
        SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ai_organize_items i JOIN ai_organize_jobs j ON j.id=i.job_id
          WHERE i.id=? AND i.lease_token=? AND i.status='processing' AND j.status='ready')
        ON CONFLICT(account_id,friend_id) DO UPDATE SET cursor_rowid=excluded.cursor_rowid,version=excluded.version,period_start=excluded.period_start,
          covered_until=excluded.covered_until,summary_json=excluded.summary_json,updated_at=excluded.updated_at
          WHERE excluded.version=ai_organize_summaries.version+1`)
        .bind(accountId, input.friendId, input.cursor, input.baseCursor + 1, input.from, input.messages[input.messages.length - 1].at, json, nowIso(), item.id, lease),
      ...Array.from({ length: Math.ceil(input.messages.length / 40) }, (_, page) => {
        const ids = input.messages.slice(page * 40, (page + 1) * 40).map(m => m.id);
        return db.prepare(`INSERT OR IGNORE INTO ai_organize_processed(account_id,friend_id,message_id)
          SELECT ?,?,m.id FROM messages_log m WHERE m.friend_id=? AND m.id IN (${ids.map(() => '?').join(',')})
            AND EXISTS(SELECT 1 FROM ai_organize_items i JOIN ai_organize_jobs j ON j.id=i.job_id
              WHERE i.id=? AND i.lease_token=? AND i.status='processing' AND j.status='ready')`)
          .bind(accountId, input.friendId, input.friendId, ...ids, item.id, lease);
      }),
      db.prepare(`UPDATE ai_organize_items SET status='done',result_json=?,input_json='',lease_token=NULL,
        charged_microusd=charged_microusd-cap_microusd+?,usage_json=json_insert(usage_json,'$[#]',json(?))
        WHERE id=? AND lease_token=? AND status='processing' AND EXISTS(SELECT 1 FROM ai_organize_jobs WHERE id=? AND status='ready')`)
        .bind(json, cost, JSON.stringify(usageRecord), item.id, lease, id),
      db.prepare(`UPDATE ai_organize_jobs SET status='completed' WHERE id=? AND status='ready'
        AND NOT EXISTS(SELECT 1 FROM ai_organize_items WHERE job_id=? AND status!='done')`).bind(id, id),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code = /^AI_[A-Z0-9_]+$/.test(message) ? message : 'AI_PROVIDER_OR_PARSE_FAILED';
    // Failed/refused/incomplete/unknown-charge calls keep their full reservation
    // charged, preserve the old summary and do not advance the cursor.
    await db.prepare(`UPDATE ai_organize_items SET status='failed',error_code=?,lease_token=NULL,
      usage_json=json_insert(usage_json,'$[#]',json(?)) WHERE id=? AND lease_token=? AND status='processing'`)
      .bind(code, JSON.stringify({ ...(usageRecord as Record<string, unknown>), chargedMicrousd: item.cap_microusd }), item.id, lease).run();
  }
  return getJob(db, id, accountId);
}
