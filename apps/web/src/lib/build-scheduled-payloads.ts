import type { LineImageUrls } from './line-image-upload'

export type ScheduledPdfDraft = {
  url: string
  fileName: string
  size: number
  expiresAt: string
  expiresAtLabel: string
}

export type ScheduledMessagePayload = {
  messageType: 'text' | 'image' | 'file'
  content: string
}

/**
 * 即時送信と同じ順序で、予約用ペイロードを種別ごとに組み立てる。
 * PDF / 画像 / テキストは排他にせず、存在する分だけ返す。
 */
export function buildScheduledPayloads(input: {
  pendingPdf?: ScheduledPdfDraft | null
  pendingImages?: LineImageUrls[]
  messageContent?: string
}): ScheduledMessagePayload[] {
  const payloads: ScheduledMessagePayload[] = []
  const { pendingPdf, pendingImages = [], messageContent = '' } = input

  if (pendingPdf) {
    payloads.push({
      messageType: 'file',
      content: JSON.stringify({
        url: pendingPdf.url,
        fileName: pendingPdf.fileName,
        fileSize: pendingPdf.size,
        expiresAt: pendingPdf.expiresAt,
        expiresAtLabel: pendingPdf.expiresAtLabel,
      }),
    })
  }

  if (pendingImages.length > 0) {
    payloads.push({
      messageType: 'image',
      content: JSON.stringify(pendingImages),
    })
  }

  const textContent = messageContent.trim()
  if (textContent) {
    payloads.push({
      messageType: 'text',
      content: textContent,
    })
  }

  return payloads
}
