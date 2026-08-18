import { afterEach, describe, expect, test, vi } from 'vitest'
import { applyAppBadge, notifyUnreadCountMayHaveChanged, UNREAD_REFRESH_EVENT } from './app-badge'

describe('applyAppBadge', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('未読があるとき setAppBadge に件数を渡す', async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined)
    const clearAppBadge = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge })
    await applyAppBadge(3)
    expect(setAppBadge).toHaveBeenCalledWith(3)
    expect(clearAppBadge).not.toHaveBeenCalled()
  })

  test('未読ゼロなら clearAppBadge', async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined)
    const clearAppBadge = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge })
    await applyAppBadge(0)
    expect(clearAppBadge).toHaveBeenCalled()
    expect(setAppBadge).not.toHaveBeenCalled()
  })

  test('API が無い環境では例外にしない', async () => {
    vi.stubGlobal('navigator', {})
    await expect(applyAppBadge(1)).resolves.toBeUndefined()
  })

  test('notifyUnreadCountMayHaveChanged がイベントを飛ばす', () => {
    const listener = vi.fn()
    const target = { dispatchEvent: vi.fn((event: Event) => listener(event.type)) }
    vi.stubGlobal('window', target)
    notifyUnreadCountMayHaveChanged()
    expect(target.dispatchEvent).toHaveBeenCalled()
    expect(listener).toHaveBeenCalledWith(UNREAD_REFRESH_EVENT)
  })
})
