import { describe, expect, test } from 'vitest'
import { createChatDeepLinkConsumer } from './chat-deep-link'

describe('chat notification navigation', () => {
  test('initial notification applies once; picker resume cannot override a manual selection', () => {
    const consume = createChatDeepLinkConsumer()
    expect(consume('a', 'initial')).toBe(true)
    // The user switches to B while the URL still contains ?friend=a.
    expect(consume('a', 'pageshow')).toBe(false)
    expect(consume('a', 'pageshow')).toBe(false)
    expect(consume('b', 'pageshow')).toBe(true)
    expect(consume('b', 'pageshow')).toBe(false)
  })

  test('back/forward revisits the same recipient and the no-query list entry', () => {
    const consume = createChatDeepLinkConsumer()
    expect(consume(null, 'initial')).toBe(false)
    expect(consume('a', 'popstate')).toBe(true)
    expect(consume('a', 'pageshow')).toBe(false)
    expect(consume(null, 'popstate')).toBe(true)
    expect(consume('a', 'popstate')).toBe(true)
    expect(consume('a', 'popstate')).toBe(true)
  })

  test('a genuinely new navigation to the same notification URL applies on a fresh page', () => {
    expect(createChatDeepLinkConsumer()('a', 'initial')).toBe(true)
    expect(createChatDeepLinkConsumer()('a', 'initial')).toBe(true)
  })
})
