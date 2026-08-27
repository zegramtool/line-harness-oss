import { describe, expect, test } from 'vitest'
import {
  chatFileDownloadHref,
  chatFilePreviewLabel,
  isChatPdfFile,
  parseChatFileContent,
} from './chat-file-content'

describe('parseChatFileContent', () => {
  test('送信 PDF の JSON を読む', () => {
    const parsed = parseChatFileContent(JSON.stringify({
      url: 'https://worker.example.com/pdf/abc',
      fileName: '見積.pdf',
      fileSize: 2048,
      expiresAtLabel: '2026/9/1 12:00',
    }))
    expect(parsed).toMatchObject({
      url: 'https://worker.example.com/pdf/abc',
      fileName: '見積.pdf',
      size: 2048,
    })
    expect(isChatPdfFile(parsed!)).toBe(true)
    expect(chatFilePreviewLabel(JSON.stringify({ url: 'https://x', fileName: '見積.pdf' }))).toBe('📎 見積.pdf')
  })

  test('受信 PDF の fileUrl をプレビュー用に使う', () => {
    const parsed = parseChatFileContent(JSON.stringify({
      url: 'https://worker.example.com/pdf/id',
      fileUrl: 'https://worker.example.com/files/id/a.pdf',
      fileName: 'a.pdf',
      size: 10,
      mimeType: 'application/pdf',
    }))
    expect(parsed?.fileUrl).toContain('/files/')
    expect(chatFileDownloadHref(parsed!)).toContain('dl=1')
  })

  test('旧テキスト [ファイル: 名前] はリンクなしで名前だけ出す', () => {
    const parsed = parseChatFileContent('[ファイル: 作業の流れ.pdf]')
    expect(parsed).toEqual({ fileName: '作業の流れ.pdf' })
    expect(chatFilePreviewLabel('[ファイル: 作業の流れ.pdf]')).toBe('📎 作業の流れ.pdf')
  })
})
