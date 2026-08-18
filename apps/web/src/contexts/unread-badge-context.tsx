'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  applyAppBadge,
  UNREAD_REFRESH_EVENT,
  publishUnreadCount,
} from '@/lib/app-badge'

const UnreadBadgeContext = createContext(0)

const POLL_MS = 60_000

export function UnreadBadgeProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      try {
        const { api } = await import('@/lib/api')
        const res = await api.chats.unreadCount()
        if (cancelled || !res.success) return
        const next = Number(res.data.count) || 0
        setCount(next)
        await applyAppBadge(next)
        publishUnreadCount(next)
      } catch {
        // サイレント失敗（オフライン時など）
      }
    }

    void refresh()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    const onRefresh = () => {
      void refresh()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener(UNREAD_REFRESH_EVENT, onRefresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      window.clearInterval(id)
      window.removeEventListener(UNREAD_REFRESH_EVENT, onRefresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <UnreadBadgeContext.Provider value={count}>{children}</UnreadBadgeContext.Provider>
}

export function useUnreadCount(): number {
  return useContext(UnreadBadgeContext)
}
