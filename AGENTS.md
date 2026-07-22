# Project Instructions

- ゴールから外れる提案をしないでください。
- ゴールに進む提案を必ずしてください。
- 回答には必ず「次のタスクはこれ」「今の進捗を全体像から整理するとこれ」を含めてください。
- 私が大学生だと思って、言語化してください。

## Cursor Cloud specific instructions

- Worker / R2 操作には Environment Secrets が必要: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `LINE_HARNESS_API_URL`, `LINE_HARNESS_API_KEY`（詳細は `仕様書.md` の「Cursor Cloud Agent から Worker デプロイする設定」）
- Secret が無いときはデプロイや R2 アップロードを無理に進めず、ダッシュボードへの登録手順を案内する
- 依存関係: `pnpm install`（`.cursor/environment.json` の install）
