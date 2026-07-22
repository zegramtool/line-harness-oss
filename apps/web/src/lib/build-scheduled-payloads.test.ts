import { describe, expect, test } from 'vitest'
import { buildScheduledPayloads } from './build-scheduled-payloads'

const samplePdf = {
  url: 'https://example.com/files/a.pdf',
  fileName: '見積.pdf',
  size: 12345,
  expiresAt: '2026-08-21T00:00:00.000Z',
  expiresAtLabel: '2026/08/21',
}

const sampleImage = {
  originalContentUrl: 'https://example.com/img.jpg',
  previewImageUrl: 'https://example.com/img-preview.jpg',
}

describe('buildScheduledPayloads', () => {
  test('PDF + テキストがあるとき両方のペイロードを返す（バグ再現防止）', () => {
    const payloads = buildScheduledPayloads({
      pendingPdf: samplePdf,
      messageContent: '見積書を送ります',
    })

    expect(payloads).toHaveLength(2)
    expect(payloads[0]).toEqual({
      messageType: 'file',
      content: JSON.stringify({
        url: samplePdf.url,
        fileName: samplePdf.fileName,
        fileSize: samplePdf.size,
        expiresAt: samplePdf.expiresAt,
        expiresAtLabel: samplePdf.expiresAtLabel,
      }),
    })
    expect(payloads[1]).toEqual({
      messageType: 'text',
      content: '見積書を送ります',
    })
  })

  test('画像 + テキストがあるとき両方のペイロードを返す', () => {
    const payloads = buildScheduledPayloads({
      pendingImages: [sampleImage],
      messageContent: '写真です',
    })

    expect(payloads).toHaveLength(2)
    expect(payloads[0].messageType).toBe('image')
    expect(payloads[1]).toEqual({ messageType: 'text', content: '写真です' })
  })

  test('PDF + 画像 + テキストは3件すべて返す', () => {
    const payloads = buildScheduledPayloads({
      pendingPdf: samplePdf,
      pendingImages: [sampleImage],
      messageContent: '全部送ります',
    })

    expect(payloads.map((p) => p.messageType)).toEqual(['file', 'image', 'text'])
  })

  test('テキストのみ', () => {
    expect(buildScheduledPayloads({ messageContent: '  hello  ' })).toEqual([
      { messageType: 'text', content: 'hello' },
    ])
  })

  test('空のときは空配列', () => {
    expect(buildScheduledPayloads({})).toEqual([])
    expect(buildScheduledPayloads({ messageContent: '   ' })).toEqual([])
  })

  test('旧バグ互換: PDFだけあるときは file のみ（テキストを捏造しない）', () => {
    const payloads = buildScheduledPayloads({ pendingPdf: samplePdf })
    expect(payloads).toHaveLength(1)
    expect(payloads[0].messageType).toBe('file')
  })
})
