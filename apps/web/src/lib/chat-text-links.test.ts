import { describe, expect, test } from 'vitest'
import { sanitizeHttpUrl, splitChatTextLinks } from './chat-text-links'

describe('splitChatTextLinks', () => {
  test('Google マップの短縮 URL をリンクにする', () => {
    const parts = splitChatTextLinks('ここです https://maps.app.goo.gl/AbCdEfGh')
    expect(parts).toEqual([
      { type: 'text', value: 'ここです ' },
      { type: 'url', value: 'https://maps.app.goo.gl/AbCdEfGh' },
    ])
  })

  test('クエリ付きの maps.google.com を切る', () => {
    const url = 'https://www.google.com/maps?q=35.681236,139.767125'
    const parts = splitChatTextLinks(`場所 ${url} お願いします`)
    expect(parts).toEqual([
      { type: 'text', value: '場所 ' },
      { type: 'url', value: url },
      { type: 'text', value: ' お願いします' },
    ])
  })

  test('URL の直後に日本語が続いても URL だけ切る', () => {
    const parts = splitChatTextLinks('https://maps.app.goo.gl/xyz現場はここ')
    expect(parts[0]).toEqual({ type: 'url', value: 'https://maps.app.goo.gl/xyz' })
    expect(parts[1]).toEqual({ type: 'text', value: '現場はここ' })
  })

  test('javascript: はリンクにしない', () => {
    expect(splitChatTextLinks('javascript:alert(1)')).toEqual([
      { type: 'text', value: 'javascript:alert(1)' },
    ])
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBeNull()
  })

  test('末尾の句点は URL に含めない', () => {
    const parts = splitChatTextLinks('https://example.com/a.')
    expect(parts[0]).toEqual({ type: 'url', value: 'https://example.com/a' })
    expect(parts[1]).toEqual({ type: 'text', value: '.' })
  })
})
