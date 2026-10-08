# 手動「AIで整理」

`zegramtool/line-harness-oss` の管理画面 `/chats` に追加した機能。別の `zegram-assistant`／ゼグロボは変更しない。

## 操作

1. 管理者（Owner/Admin）が対象LINEアカウントを選び、「AIで整理」を開く。
2. 初回の開始日と終了日を日本時間で指定し「対象件数と費用を確認」。最大366日。保存要約があるお客様は、その要約の開始日から未処理発言を取得する。
3. 会話数・発言数・モデル・概算・再試行込み予約予算・送信対象を確認して実行。
4. 用件、経緯、返信候補、未完了候補、次の対応をお客様別に表示。各項目に発言ID、原文日時、既存チャットへのリンクを保存する。
5. 上限で残った分は、再度件数確認して続きだけ実行。新着ゼロならAPIを呼ばない。

AIは返信、チャット状態、既存タスク、完了判定を変更しない。「返信を観測」と「完了の申告」を区別し、全項目を要確認とする。根拠IDが実在し同じ会話・アカウントに属することを検証するが、根拠の意味と要約の正しさは人間が確認する。

## 接続と送信内容

既定は **無効**。`AI_ORGANIZE_ENABLED=true` と Worker Secret `OPENAI_API_KEY` の両方が必要。既存LINE MCPやowner APIキーをモデルに渡さず、モデルのツールも登録しない。

送信先は固定の `https://api.openai.com/v1/responses`。会話のテキスト、方向、発言の出所、お客様を区別するアプリ内の会話ID、内部発言ID、発言日時、前回保存要約のみ。会話IDはfriends.idでありLINE user IDではない。保存要約はテキスト・根拠ID/日時・候補状態だけに絞り、画面用URLも除く。氏名などのプロフィール項目、LINE user ID、画像・PDF本体、既知の自動配信・自動返信は対象外。過去CSV履歴はoutgoingも含めるが、人間の返信か不明な場合はunknownとする。ただし原文テキストに含まれる氏名、住所、電話番号等は送信される。実行画面にも明記する。`store:false` を指定する。これはAPIの応答保存指定であり、プロバイダー全体のデータ保持条件を変更するものではない。

設定値（Workerのvars、秘密値のみSecrets）：

| 設定 | 既定 |
|---|---|
| `AI_ORGANIZE_ENABLED` | false |
| `AI_ORGANIZE_MODEL` | gpt-6-luna |
| `AI_ORGANIZE_MAX_INPUT_USD_PER_M` | 0.125 |
| `AI_ORGANIZE_OUTPUT_USD_PER_M` | 0.50 |
| `AI_ORGANIZE_JOB_LIMIT_USD` | 0.10（提案値・本番未承認） |
| `AI_ORGANIZE_MONTH_LIMIT_USD` | 3.00（提案値・本番未承認） |

modelを変更する場合は両単価も明示設定する。高価なモデルへの自動切替なし。`service_tier:default`、`reasoning.effort:low`、strict JSON schema。モデルが利用できない場合は停止する。

2026-10-08確認の [公式モデル仕様](https://developers.openai.com/api/docs/models/gpt-6-luna) は100万トークン当たり入力$0.10、キャッシュ書込$0.125、出力$0.50。予約は入力がすべてキャッシュ書込になる単価を使用し、キャッシュ割引を仮定しない。価格改定時は設定更新が必要。[構造化出力](https://developers.openai.com/api/docs/guides/structured-outputs)、[推論トークンと最大出力](https://developers.openai.com/api/docs/guides/reasoning) の公開仕様に合わせる。

## 上限と永続化

- 手動開始のみ。Webhook/cronから起動しない。1ジョブ最大10会話、会話ごと最大100発言、最大24,000 UTF-8バイト相当の保守的入力トークン上限。schema・指示・wrapperを含むJSONサイズに1,024の余裕を加える。入力272Kを十分下回る。
- 1発言8,000 UTF-8バイト上限。長すぎる発言は切り捨てて処理済みにせず停止する。画像/PDFの内容は評価しない。
- 出力は推論込み最大2,048トークン。1会話ごと初回＋明示再試行1回。再試行は自動で行わない。拒否、不完全応答、JSON不正、根拠不正で前回要約を保持する。
- D1にジョブ、入力snapshot、項目状態、lease、usage、要約、処理済み発言ID、取り込みrowidと要約versionを保持する。処理済みIDにより同日時の発言・後日取り込み・過去期間の終了日で生じた穴を取りこぼさない。
- プレビューは30分。確認後は24時間。UTC月をまたぐ実行は停止・精算し、新しいプレビューを必要とする。
- DBの一意制約で全アカウントを通じて同時実行ジョブ1個。項目claimもDBで比較更新し、API呼び出し前に最大額を記録する。20秒タイムアウト・120秒lease。再読み込み後は手動で再開。
- 開始時に月予算へ全リクエスト・再試行分を予約する。D1 batchのtransaction＋CHECK＋triggerにより、予算不足/同時開始/古いプレビューを原子的に拒否する。予算はUSDの百万分の一の整数。
- 成功はusageの入力・出力総量（推論を含む）を保存し、設定の保守的単価で記録。失敗・timeout・中断・不明請求はその試行の最大額を消費扱い。完了/中止で未消費予約を返す。料金変更やプロバイダー仕様差まで保証する請求側のhard capではない。
- 成功済み入力snapshotは即時消去。中止時も消去。同じ担当者が確認し直すと古い未実行snapshotを消去する。停止中ジョブの入力は再開のため保持するので、不要なジョブは画面から中止する。監査用のestimate/usage・保存要約は自動削除しない。
- 候補の対象期間検索ではD1の行読み取りも発生する。件数上限は返す件数/API入力の上限でありSQL走査行数の上限ではない。本番データ量・利用統計は未測定。無料枠通知の原因調査・計測は本番有効化前に確認する。
- 日時変換に一致する会話ID＋日時の式インデックスを使用し、候補抽出はfriends→保存要約→messagesの順序を固定する。合成SQLiteの実行計画で両検索が会話ID＋開始/終了日時の範囲検索になることを検証した。全メッセージ表の走査は回避するが、同じ対象期間の候補と処理済みIDの確認はプレビューごとに繰り返すため、D1読み取りが新着件数だけになる保証はない。初回のインデックス作成にも全既存メッセージに対する読み取り・書き込み費用があるため、本番適用前に統計と実施タイミングを確認する。

## APIと実装

既存Cookie/Bearer認証とCSRFを使用。Owner/Adminのみ。ボディは4KBまで。原文/キーをエラーやログへ出力しない。

- `GET /api/ai-organize/summaries?accountId=...`：保存要約と最新/実行中ジョブ（最大100会話）
- `POST /api/ai-organize/preview`：`{accountId,from,to}`。OpenAI呼び出しなし。
- `POST /api/ai-organize/jobs/:id/start`：確認済み範囲と予算を予約。
- `POST /api/ai-organize/jobs/:id/step`：`{accountId,retry?:true}`。1会話のみ処理。
- `POST /api/ai-organize/jobs/:id/cancel`：未消費予約精算、成功済み要約保持。
- `GET /api/ai-organize/jobs/:id?accountId=...`：入力snapshotを返さない。

DB migration `049_ai_organize.sql` と生成済みbootstrapを同梱。transaction triggerを扱うためbootstrap用SQL分割も対応。公開・デプロイは既存GitHub Actionsの手順に従うが、この作業ではpush・Actions・本番migrationを実行していない。

## 本番利用前の最小確認

対象アカウント・最初の期間、原文と保存要約をOpenAIへ送信すること、1回/月予算をユーザーが確認する。その後、適切なOpenAIプロジェクトのSecret設定と機能有効化、本番migration・Worker・管理画面の反映について承認を得る。キー作成/課金設定/実会話送信はこのローカル実装に含めない。

合成データ＋mock APIで失敗/拒否/上限/重複/同時実行/再開/会話根拠/期間の穴を検証。実モデルの応答品質は未評価。新機能以外の既存未返信集計は変更していない。
