'use client'

import { useEffect, useState } from 'react'
import {
  getWebPushStatus,
  registerChatServiceWorker,
  subscribeWebPush,
  type WebPushStatus,
} from '@/lib/web-push-client'

export default function WebPushEnableButton() {
  const [status, setStatus] = useState<WebPushStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await registerChatServiceWorker()
      const next = await getWebPushStatus()
      if (!cancelled) setStatus(next)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!status || status === 'unsupported') return null

  if (status === 'subscribed') {
    return (
      <p className="px-3 py-2 text-[11px] leading-snug text-gray-400">
        通知オン。数字がホーム画面に付かないときは、iPhone の 設定 → 通知 → チャット →
        <span className="font-medium text-gray-600"> バッジ </span>
        をオンにする
      </p>
    )
  }

  const label =
    status === 'needs-home-screen'
      ? 'ホーム画面に追加すると、閉じても未読が届く'
      : status === 'denied'
        ? '通知が拒否されています（設定から許可）'
        : '閉じても未読を受け取る'

  return (
    <div className="px-3 py-2">
      {status === 'needs-permission' ? (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              setStatus(await subscribeWebPush())
            } catch {
              setStatus('needs-permission')
            } finally {
              setBusy(false)
            }
          }}
          className="w-full text-left text-xs text-gray-600 hover:text-gray-900"
        >
          {busy ? '設定中…' : '通知をオン（未読バッジ）'}
        </button>
      ) : (
        <p className="text-[11px] leading-snug text-gray-400">{label}</p>
      )}
    </div>
  )
}
