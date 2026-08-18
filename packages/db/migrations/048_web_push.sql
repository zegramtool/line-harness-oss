-- Web Push 購読（ホーム画面バッジをアプリ終了中も更新する）
CREATE TABLE IF NOT EXISTS web_push_vapid (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  public_key  TEXT NOT NULL,
  private_key TEXT NOT NULL,
  subject     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id          TEXT PRIMARY KEY,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  staff_id    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_web_push_subscriptions_endpoint
  ON web_push_subscriptions (endpoint);
