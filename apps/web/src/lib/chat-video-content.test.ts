import { describe, expect, test } from 'vitest'
import { chatVideoDownloadHref, parseChatVideoContent } from './chat-video-content'

describe('parseChatVideoContent', () => {
  test('受信 JSON から再生 URL を読む', () => {
    const parsed = parseChatVideoContent(JSON.stringify({
      originalContentUrl: 'https://worker.example.com/images/incoming-a-m.mp4',
      previewImageUrl: 'https://worker.example.com/images/incoming-a-m-preview.jpg',
      mimeType: 'video/mp4',
      size: 200,
      durationMs: 1200,
    }))
    expect(parsed?.originalContentUrl).toContain('.mp4')
    expect(parsed?.previewImageUrl).toContain('preview.jpg')
    expect(chatVideoDownloadHref(parsed!.originalContentUrl)).toContain('download=1')
  })

  test('旧テキスト [動画] は再生できない', () => {
    expect(parseChatVideoContent('[動画]')).toBeNull()
  })
})
