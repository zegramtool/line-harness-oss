# AI実装とD1無料枠通知の監査

確認日：2026-10-08（UTC）。通知時刻・閾値は親タスクがメールから確認した情報。

通知：D1 `rows_read` の日次無料枠500万行に対し75%（約375万行）。送信10/8 22:47:45 UTC、reset10/9 00:00 UTC。アカウント全体でDB名の指定なし。

今回のAI実装で実行したもの：最新Git fetch、依存パッケージ取得、公式ドキュメント閲覧、ローカル編集、合成SQLiteテスト、Worker/Next.jsローカルビルド、合成fixtureを使った127.0.0.1の画面検証。Cloudflare本番Workerリクエスト、remote D1/R2、wrangler remote操作、push、CI起動、デプロイ、OpenAI API呼び出しは **0回**。

前回の読み取り調査では `tacteq-line` の `GET /api/capabilities`、`GET /api/conversations?limit=1` と `zegram-assistant` の `GET /health` 各1回がHTTP 403だった。403だけからD1がゼロ行だったとまでは断定しない。今回の実装フェーズではこれらを再実行していない。

既存 `apps/worker/wrangler.toml` と `vite.config.ts` にremote bindingの指定は見つからず、Worker開発サーバーは起動していない。画面検証はビルド済み本体を合成データのローカルHTTPサーバーで配信し、API URLも127.0.0.1に指定。本番認証値をコピーしていない。

Mac Chromeの正規Cloudflare管理画面 `https://dash.cloudflare.com/` はログイン画面だった。新しいログイン/資格情報追加/別経路での403回避は行わず停止。DB別Row Metricsは未確認。ログイン待ちタブを保持し、待ちの間に統計のポーリングや本番SQLは行わない。

ソース上の候補（基準main `fb883308`。原因の確定ではない）：

- `apps/web/src/components/layout/sidebar.tsx`：mount時と5分ごとに `/api/inbox/unanswered/count`。非表示のガードなし。
- `apps/worker/src/services/unanswered-inbox.ts`：`countUnanswered` は `getAllUnansweredRows` を呼び、`CANDIDATES_SQL` が `messages_log GROUP BY friend_id` を全体集約。候補があれば受信とauto_replyのクエリも `last_manual` を履歴全体から再集約する。索引が存在しても履歴行の読み取り量がゼロになるわけではない。
- `apps/web/src/contexts/unread-badge-context.tsx`：画面表示中に60秒ごとの未読件数取得。非表示時は停止する。フォーカス復帰と状態変更時にも取得。
- `apps/worker/src/routes/chats.ts`：チャット一覧は履歴集約と最新incoming/anyのwindow関数。アカウントを指定すると範囲は絞るが、そのアカウントの履歴を繰り返し読む。
- `apps/worker/src/index.ts` の既存cron：5分ごとに配信/予約/リマインダー/復旧/ヘルス等複数処理。`scheduled_messages(status,scheduled_at)` 等に索引あり。個々の実消費は未測定。

改善案：件数の短時間キャッシュ、非表示時のサイドバーpoll停止、更新時に友だち単位の最終受信・人間返信を保持して履歴全件の再集約を避ける。これらは提案のみで、今回のAIブランチでは既存集計を変更しない。統計閲覧可能になったら10/8 UTC開始以降の `tacteq-line` と `zegram-assistant-db` のread rowsを比較する。
