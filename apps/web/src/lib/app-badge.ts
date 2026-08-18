export const UNREAD_REFRESH_EVENT = 'lh:unread-refresh'
export const UNREAD_COUNT_EVENT = 'lh:unread-count'

export function notifyUnreadCountMayHaveChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(UNREAD_REFRESH_EVENT))
}

export function publishUnreadCount(count: number): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(UNREAD_COUNT_EVENT, { detail: { count } }))
}

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/** ホーム画面アイコンの赤バッジ。iOS 16.4+ のホーム画面 Web アプリで有効。 */
export async function applyAppBadge(count: number): Promise<void> {
  if (typeof navigator === 'undefined') return
  const nav = navigator as BadgeNavigator
  try {
    if (count > 0 && typeof nav.setAppBadge === 'function') {
      await nav.setAppBadge(count)
      return
    }
    if (typeof nav.clearAppBadge === 'function') {
      await nav.clearAppBadge()
    }
  } catch {
    // 非対応ブラウザ / 権限なし
  }
}
