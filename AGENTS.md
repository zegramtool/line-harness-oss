# Project Instructions

- ゴールから外れる提案をしないでください。
- ゴールに進む提案を必ずしてください。
- 回答には必ず「次のタスクはこれ」「今の進捗を全体像から整理するとこれ」を含めてください。
- 私が大学生だと思って、言語化してください。

## Cursor Cloud specific instructions

- **Cloudflare / R2 / D1 / Worker デプロイは GitHub Actions 経由で行う**（リポジトリ Secrets に `CLOUDFLARE_API_TOKEN` 等がある）。Cloud Agent 環境に Cloudflare トークンは入れない運用でよい
- TacTeQ 運用（PDF アップロード・フォーム fields 更新）: `TacTeQ Ops` ワークフロー（関連ファイルを `main` に push すると `both` 実行。手動は Actions 画面から `workflow_dispatch`）
- Worker 本番反映: `main` へのマージで `Deploy Cloudflare Worker` が走る
- Harness API（`LINE_HARNESS_API_KEY`）が必要な手元スクリプトは、キーが無いときは D1 直更新（`pnpm tacteq:update-inquiry-form-fields-d1`）や Actions を使う
- 依存関係: `pnpm install`（`.cursor/environment.json` の install）
