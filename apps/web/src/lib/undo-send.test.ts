import { describe, expect, test } from 'vitest'
import { isUndoSendWindow, remainingUndoSeconds, UNDO_SEND_SECONDS } from './undo-send'

describe('undo-send', () => {
  test('12秒後は取り消しウィンドウ内', () => {
    const created = '2026-08-18T15:00:00.000+09:00'
    const scheduled = '2026-08-18T15:00:12.000+09:00'
    expect(UNDO_SEND_SECONDS).toBe(12)
    expect(isUndoSendWindow(created, scheduled)).toBe(true)
  })

  test('1時間後は通常予約', () => {
    const created = '2026-08-18T15:00:00.000+09:00'
    const scheduled = '2026-08-18T16:00:00.000+09:00'
    expect(isUndoSendWindow(created, scheduled)).toBe(false)
  })

  test('残り秒数は切り上げ、期限後は0', () => {
    const scheduled = '2026-08-18T15:00:12.000+09:00'
    const now = Date.parse('2026-08-18T15:00:00.100+09:00')
    expect(remainingUndoSeconds(scheduled, now)).toBe(12)
    expect(remainingUndoSeconds(scheduled, Date.parse('2026-08-18T15:00:13.000+09:00'))).toBe(0)
  })
})
