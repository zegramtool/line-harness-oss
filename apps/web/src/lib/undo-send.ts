/** 「今すぐ送る」の取り消し可能時間（Worker 側 UNDO_SEND_DELAY_MS と揃える） */
export const UNDO_SEND_DELAY_MS = 12_000
export const UNDO_SEND_DETECT_MAX_MS = 20_000
export const UNDO_SEND_SECONDS = UNDO_SEND_DELAY_MS / 1000

export function isUndoSendWindow(createdAt: string, scheduledAt: string): boolean {
  const createdMs = Date.parse(createdAt)
  const scheduledMs = Date.parse(scheduledAt)
  if (!Number.isFinite(createdMs) || !Number.isFinite(scheduledMs)) return false
  const delta = scheduledMs - createdMs
  return delta > 0 && delta <= UNDO_SEND_DETECT_MAX_MS
}

export function remainingUndoSeconds(scheduledAt: string, nowMs = Date.now()): number {
  const scheduledMs = Date.parse(scheduledAt)
  if (!Number.isFinite(scheduledMs)) return 0
  return Math.max(0, Math.ceil((scheduledMs - nowMs) / 1000))
}
