import { afterEach, describe, expect, test, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function uploadPdf() {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://127.0.0.1:8787')
  return (await import('./api')).api.uploads.pdf
}

describe('chat PDF upload', () => {
  test('uploads the complete file bytes and encoded filename', async () => {
    const file = new File(['%PDF-1.7'], '見積書.pdf', { type: 'application/pdf' })
    const fetchMock = vi.fn(async () => Response.json({ success: true, data: { size: file.size } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect((await uploadPdf())(file)).resolves.toMatchObject({ success: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/api/files',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/pdf',
          'X-Filename': encodeURIComponent(file.name),
        }),
        body: await file.arrayBuffer(),
      }),
    )
  })

  test('identifies a local file access error without uploading anything', async () => {
    const file = new File(['%PDF-1.7'], 'estimate.pdf')
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new TypeError('Load failed'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect((await uploadPdf())(file)).rejects.toThrow('PDFファイルを読み込めませんでした')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('stops before upload when the file read returns incomplete bytes', async () => {
    const file = new File(['%PDF-1.7'], 'estimate.pdf')
    vi.spyOn(file, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(0))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect((await uploadPdf())(file)).rejects.toThrow('PDFファイルを読み込めませんでした')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('gives a separate connection error and does not retry an uncertain upload', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Load failed'))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['%PDF-1.7'], 'estimate.pdf')

    await expect((await uploadPdf())(file)).rejects.toThrow('サーバーに接続できませんでした')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
