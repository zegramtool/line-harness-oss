import Link from 'next/link'

const sections = [
  {
    title: '毎日使う機能（TacTeQ）',
    items: [
      {
        name: '個別チャット',
        href: '/chats',
        body: '友だちとの1対1トーク。返信・メモ・ステータス（未読/対応中/完了）・タグ付けはここから行います。公式LINEアプリから手動返信した内容はHarnessに取り込まれないため、運用返信は原則この画面から送ってください。',
      },
      {
        name: 'フォーム回答',
        href: '/form-submissions',
        body: 'LIFFお問い合わせフォームの送信内容を確認します。タグ「問合せ済」が付与された友だちは友だち管理からも絞り込めます。',
      },
      {
        name: 'タグ管理',
        href: '/tags',
        body: 'タグの追加・削除はここ。友だちへの付け外しは「友だち管理」または「個別チャット」のメニューから行います。「問合せ済」はフォーム送信時に自動付与されます。',
      },
      {
        name: '友だち管理',
        href: '/friends',
        body: '友だち一覧・タグ・メモの管理。CSVインポートで取り込んだ過去チャットと紐づく表示名もここで確認できます。',
      },
      {
        name: '未対応',
        href: '/notifications',
        body: '対応が必要なチャットの一覧。個別チャットでステータスを更新するとここから消えます。',
      },
    ],
  },
  {
    title: '配信・自動化',
    items: [
      {
        name: '友だち追加時設定',
        href: '/friend-add-settings',
        body: '友だち追加直後に送るウェルカムメッセージ（TacTeQは4通）を設定します。LINE公式の「あいさつメッセージ」はOFFにし、Harness側で送る運用です。',
      },
      {
        name: 'シナリオ配信',
        href: '/scenarios',
        body: 'ステップ配信（例: 友だち追加ウェルカム）。トリガーや待機時間を組み合わせた自動シーケンスです。',
      },
      {
        name: '一斉配信',
        href: '/broadcasts',
        body: 'タグや条件で絞った一斉メッセージ配信。',
      },
      {
        name: 'テンプレート',
        href: '/templates',
        body: 'よく使う文面を登録し、チャットや配信から呼び出します。',
      },
      {
        name: 'リッチメニュー',
        href: '/rich-menus',
        body: 'トーク画面下部のメニュー画像とタップアクションの管理。',
      },
      {
        name: 'オートメーション / 自動返信',
        href: '/automations',
        body: 'キーワードやイベントをきっかけにした自動処理。TacTeQではフォーム送信後のメッセージなどに利用しています。',
      },
    ],
  },
  {
    title: '分析・その他',
    items: [
      {
        name: 'リファラルリンク / CV計測',
        href: '/inflow-links',
        body: '流入経路の計測。広告やQRからの友だち追加を追跡する場合に使います。',
      },
      {
        name: 'スコアリング',
        href: '/scoring',
        body: '友だちの行動に点数を付け、セグメント配信の材料にします。',
      },
      {
        name: '重複検出',
        href: '/duplicates',
        body: '同一人物と思われる友だちレコードの候補を表示します。',
      },
      {
        name: 'BAN検知',
        href: '/health',
        body: 'LINE APIのエラー傾向からアカウントリスクを監視します。',
      },
    ],
  },
  {
    title: 'TacTeQでは通常使わない機能',
    items: [
      {
        name: '予約・イベント',
        href: '/booking/bookings',
        body: '予約システム連携。TacTeQの現行運用では未使用です。',
      },
      {
        name: 'プール管理',
        href: '/pools',
        body: '複数LINE公式アカウントを束ねる機能。TacTeQは単一アカウント運用のため不要です。',
      },
      {
        name: 'アップデート履歴',
        href: '/updates',
        body: 'Harness本体の自動アップデート履歴です。TacTeQはフォーク＋手動デプロイのため履歴が空でも問題ありません。',
      },
      {
        name: '緊急コントロール',
        href: '/emergency',
        body: '全配信の一時停止など。障害時のみ使用してください。',
      },
    ],
  },
  {
    title: '運用上の注意',
    items: [
      {
        name: '返信の取り込み',
        body: '公式LINEアプリから直接返信したメッセージはWebhookに載らず、Harnessの個別チャットには表示されません。履歴の一元管理が必要な場合は管理画面から返信してください。',
      },
      {
        name: 'スマホでの利用',
        body: 'iPhone/Androidではログイン後にBearer認証を使います。ブラウザのタブを閉じると再ログインが必要になる場合があります。',
      },
      {
        name: '詳細仕様',
        body: 'リポジトリ内の仕様書.mdにデプロイ手順・フォーム設定・インポート手順がまとまっています（開発者向け）。',
      },
    ],
  },
]

export default function HelpPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 pb-16">
      <h1 className="text-xl font-semibold mb-2">ヘルプ</h1>
      <p className="text-sm text-gray-500 mb-8">
        LINE Harness をフォークして構築した TacTeQ 管理画面の機能ガイドです。迷ったらまず「個別チャット」と「フォーム回答」から始めてください。
      </p>

      <div className="space-y-10">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 border-b pb-2">
              {section.title}
            </h2>
            <ul className="space-y-4">
              {section.items.map((item) => (
                <li
                  key={item.name}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium text-gray-900">{item.name}</h3>
                    {'href' in item && item.href ? (
                      <Link
                        href={item.href}
                        className="text-xs text-blue-600 underline shrink-0"
                      >
                        画面を開く →
                      </Link>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.body}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
