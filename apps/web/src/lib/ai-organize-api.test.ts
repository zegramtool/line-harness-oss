import { afterEach, describe, expect, test, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })
async function client() {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://127.0.0.1:8787')
  return (await import('./api')).fetchApi
}
describe('AI API errors', () => {
  test('surfaces safe application error codes for the manual feature', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: false, error: 'AI_BUDGET_OR_CONCURRENCY_LIMIT' }, { status: 400 })))
    const request = await client()
    await expect(request('/api/ai-organize/preview', undefined, true)).rejects.toThrow('AI_BUDGET_OR_CONCURRENCY_LIMIT')
  })
  test('does not expose arbitrary error bodies or change existing callers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'private provider body' }, { status: 500 })))
    const request = await client()
    await expect(request('/api/ai-organize/preview', undefined, true)).rejects.toThrow('API error: 500')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'AI_NOT_ENABLED' }, { status: 400 })))
    await expect(request('/api/chats')).rejects.toThrow('API error: 400')
  })
})
