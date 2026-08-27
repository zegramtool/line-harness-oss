import { describe, test, expect, vi } from 'vitest';
import {
  fetchAndStoreIncomingFile,
  looksLikePdf,
  sanitizeIncomingFilename,
} from './incoming-file.js';

const PDF_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeR2Stub() {
  const store = new Map<string, { data: ArrayBuffer; contentType: string; meta?: Record<string, string> }>();
  return {
    put: vi.fn(async (
      key: string,
      data: ArrayBuffer,
      opts: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
    ) => {
      store.set(key, {
        data,
        contentType: opts.httpMetadata?.contentType ?? '',
        meta: opts.customMetadata,
      });
      return null;
    }),
    _store: store,
  };
}

describe('looksLikePdf / sanitizeIncomingFilename', () => {
  test('filename or mime で PDF と判定する', () => {
    expect(looksLikePdf('見積.pdf', 'application/octet-stream')).toBe(true);
    expect(looksLikePdf('x.bin', 'application/pdf')).toBe(true);
    expect(looksLikePdf('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false);
  });

  test('パスと制御文字を落とす', () => {
    expect(sanitizeIncomingFilename('/tmp/../見積.xlsx')).toBe('見積.xlsx');
    expect(sanitizeIncomingFilename('')).toBe('file.bin');
  });
});

describe('fetchAndStoreIncomingFile', () => {
  test('PDF は files/ に保存しビューア URL を返す', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () =>
      new Response(new ArrayBuffer(120), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf', 'Content-Length': '120' },
      }),
    );

    const result = await fetchAndStoreIncomingFile({
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      workerUrl: 'https://worker.example.com',
      channelAccessToken: 'token-abc',
      accountId: 'acc-1',
      messageId: 'msg-pdf',
      fileName: '見積書.pdf',
      fileSize: 120,
      id: PDF_ID,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-data.line.me/v2/bot/message/msg-pdf/content',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-abc' },
      }),
    );
    expect(r2.put).toHaveBeenCalled();
    const [key, , opts] = r2.put.mock.calls[0];
    expect(key).toBe(`files/${PDF_ID}.pdf`);
    expect(opts.httpMetadata.contentType).toBe('application/pdf');
    expect(opts.customMetadata.originalFilename).toBe('見積書.pdf');
    expect(opts.customMetadata.source).toBe('incoming');
    expect(opts.customMetadata.expiresAt).toBeUndefined();
    expect(result).toEqual({
      url: `https://worker.example.com/pdf/${PDF_ID}`,
      fileUrl: `https://worker.example.com/files/${PDF_ID}/%E8%A6%8B%E7%A9%8D%E6%9B%B8.pdf`,
      fileName: '見積書.pdf',
      size: 120,
      mimeType: 'application/pdf',
    });
  });

  test('octet-stream でもファイル名が .pdf なら PDF として保存する', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () =>
      new Response(new ArrayBuffer(40), {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    );

    const result = await fetchAndStoreIncomingFile({
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      workerUrl: 'https://worker.example.com/',
      channelAccessToken: 'token-abc',
      accountId: 'acc-1',
      messageId: 'msg-bin',
      fileName: 'flow.PDF',
      id: PDF_ID,
    });

    expect(r2.put.mock.calls[0][0]).toBe(`files/${PDF_ID}.pdf`);
    expect(result?.mimeType).toBe('application/pdf');
    expect(result?.fileName).toBe('flow.PDF');
  });

  test('PDF 以外は incoming- キーで /images に保存する', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () =>
      new Response(new ArrayBuffer(50), {
        status: 200,
        headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      }),
    );

    const result = await fetchAndStoreIncomingFile({
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      workerUrl: 'https://worker.example.com',
      channelAccessToken: 'token-abc',
      accountId: 'acc-1',
      messageId: 'msg-doc',
      fileName: 'notes.docx',
    });

    expect(r2.put.mock.calls[0][0]).toBe('incoming-acc-1-msg-doc.docx');
    expect(result?.url).toBe('https://worker.example.com/images/incoming-acc-1-msg-doc.docx');
    expect(result?.fileName).toBe('notes.docx');
  });

  test('Content API が非 200 なら null', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    const result = await fetchAndStoreIncomingFile({
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      workerUrl: 'https://worker.example.com',
      channelAccessToken: 'token-bad',
      accountId: 'acc-1',
      messageId: 'missing',
      fileName: 'a.pdf',
    });
    expect(result).toBeNull();
    expect(r2.put).not.toHaveBeenCalled();
  });

  test('20MB 超は取らない', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn();
    const result = await fetchAndStoreIncomingFile({
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      workerUrl: 'https://worker.example.com',
      channelAccessToken: 'token-abc',
      accountId: 'acc-1',
      messageId: 'huge',
      fileName: 'huge.pdf',
      fileSize: 21 * 1024 * 1024,
    });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
