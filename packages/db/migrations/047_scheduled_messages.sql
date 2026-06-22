-- 個別チャット予約送信
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id              TEXT PRIMARY KEY,
  friend_id       TEXT NOT NULL REFERENCES friends (id) ON DELETE CASCADE,
  chat_id         TEXT REFERENCES chats (id) ON DELETE SET NULL,
  message_type    TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'flex', 'file')),
  message_content TEXT NOT NULL,
  alt_text        TEXT,
  scheduled_at    TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')) DEFAULT 'pending',
  sent_at         TEXT,
  error_message   TEXT,
  line_account_id TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due ON scheduled_messages (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_friend ON scheduled_messages (friend_id, status);
