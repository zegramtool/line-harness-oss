-- Manual AI jobs only. No LINE/chat/task state is changed by this feature.
-- Match the legacy-JST/offset-aware period predicate exactly. No all-history
-- scan is needed per preview; processed IDs still require checks in this range.
CREATE INDEX IF NOT EXISTS ai_organize_messages_friend_instant ON messages_log (
  friend_id,
  (julianday(created_at) - CASE WHEN created_at LIKE '%Z' OR substr(created_at,-6,1) IN ('+','-') THEN 0 ELSE 9.0/24 END)
);
CREATE TABLE IF NOT EXISTS ai_organize_budgets (
  period TEXT PRIMARY KEY,
  limit_microusd INTEGER NOT NULL CHECK(limit_microusd >= 0),
  reserved_microusd INTEGER NOT NULL DEFAULT 0 CHECK(reserved_microusd >= 0),
  spent_microusd INTEGER NOT NULL DEFAULT 0 CHECK(spent_microusd >= 0),
  CHECK(reserved_microusd + spent_microusd <= limit_microusd)
);
CREATE TABLE IF NOT EXISTS ai_organize_jobs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES line_accounts(id),
  created_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('preview','ready','completed','cancelled')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  period TEXT NOT NULL,
  config_json TEXT NOT NULL,
  estimate_json TEXT NOT NULL,
  reserve_microusd INTEGER NOT NULL CHECK(reserve_microusd >= 0)
);
-- Across all accounts, only one manually confirmed job can spend at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ai_organize_one_active ON ai_organize_jobs((1)) WHERE status = 'ready';
CREATE TABLE IF NOT EXISTS ai_organize_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES ai_organize_jobs(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  display_name TEXT,
  ordinal INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','failed','done')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 2),
  lease_token TEXT,
  lease_until TEXT,
  input_json TEXT NOT NULL,
  cap_microusd INTEGER NOT NULL,
  charged_microusd INTEGER NOT NULL DEFAULT 0 CHECK(charged_microusd >= 0),
  usage_json TEXT NOT NULL DEFAULT '[]',
  result_json TEXT,
  error_code TEXT,
  UNIQUE(job_id, friend_id)
);
CREATE INDEX IF NOT EXISTS ai_organize_items_job ON ai_organize_items(job_id,status,ordinal);
CREATE INDEX IF NOT EXISTS ai_organize_jobs_account ON ai_organize_jobs(account_id,created_at);
CREATE TABLE IF NOT EXISTS ai_organize_summaries (
  account_id TEXT NOT NULL REFERENCES line_accounts(id),
  friend_id TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  cursor_rowid INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  period_start TEXT NOT NULL,
  covered_until TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(account_id, friend_id)
);
CREATE TABLE IF NOT EXISTS ai_organize_processed (
  account_id TEXT NOT NULL REFERENCES line_accounts(id),
  friend_id TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages_log(id) ON DELETE CASCADE,
  PRIMARY KEY(account_id,friend_id,message_id)
);
-- A budget constraint failure rolls the whole D1 batch back, including status.
CREATE TRIGGER IF NOT EXISTS ai_organize_preview_fresh
BEFORE UPDATE OF status ON ai_organize_jobs
WHEN OLD.status = 'preview' AND NEW.status = 'ready'
BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM ai_organize_items i
    LEFT JOIN ai_organize_summaries s ON s.account_id=NEW.account_id AND s.friend_id=i.friend_id
    LEFT JOIN friends f ON f.id=i.friend_id
    WHERE i.job_id=NEW.id AND (COALESCE(s.version,0)!=json_extract(i.input_json,'$.baseCursor')
      OR f.line_account_id!=NEW.account_id OR f.id IS NULL)
  ) THEN RAISE(ABORT, 'AI_PREVIEW_STALE') END;
END;
CREATE TRIGGER IF NOT EXISTS ai_organize_reserve
AFTER UPDATE OF status ON ai_organize_jobs
WHEN OLD.status = 'preview' AND NEW.status = 'ready'
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_organize_budgets WHERE period=NEW.period)
    THEN RAISE(ABORT, 'AI_BUDGET_MISSING') END;
  UPDATE ai_organize_budgets SET reserved_microusd=reserved_microusd+NEW.reserve_microusd
    WHERE period=NEW.period;
END;
CREATE TRIGGER IF NOT EXISTS ai_organize_settle
AFTER UPDATE OF status ON ai_organize_jobs
WHEN OLD.status = 'ready' AND NEW.status IN ('completed','cancelled')
BEGIN
  UPDATE ai_organize_budgets
    SET reserved_microusd=reserved_microusd-NEW.reserve_microusd,
        spent_microusd=spent_microusd+COALESCE((SELECT SUM(charged_microusd) FROM ai_organize_items WHERE job_id=NEW.id),0)
    WHERE period=NEW.period;
END;
