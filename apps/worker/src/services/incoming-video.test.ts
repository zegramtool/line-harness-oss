import { describe, test, expect, vi } from 'vitest';
import { fetchAndStoreIncomingVideo, INCOMING_VIDEO_MAX_BYTES } from './incoming-video.js';

function makeR2Stub() {
  const store = new Map<string, { data: ArrayBuffer; contentType: string }>();
  return {
    put: vi.fn(async (key: string, data: ArrayBuffer, opts: { httpMetadata?: { contentType?: string } }) => {
      store.set(key, { data, contentType: opts.httpMetadata?.contentType ?? '' });
      return null;
    }),
    _store: store,
  };
}

describe('fetchAndStoreIncomingVideo', () => {
  test('動画本体とサムネを R2 に保存する', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/preview')) {
        return new Response(new ArrayBuffer(20), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }
      return new Response(new ArrayBuffer(200), {
        status: 200,
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': '200' },
      });
    });

    const result = await fetchAndStoreIncomingVideo({
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      workerUrl: 'https://worker.example.com',
      channelAccessToken: 'token-abc',
      accountId: 'acc-1',
      messageId: 'msg-vid',
      durationMs: 3500,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-data.line.me/v2/bot/message/msg-vid/content',
      expect.objectContaining({ headers: { Authorization: 'Bearer token-abc' } }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-data.line.me/v2/bot/message/msg-vid/content/preview',
      expect.objectContaining({ headers: { Authorization: 'Bearer token-abc' } }),
    );
    const keys = r2.put.mock.calls.map((c) => c[0]);
    expect(keys).toContain('incoming-acc-1-msg-vid.mp4');
    expect(keys).toContain('incoming-acc-1-msg-vid-preview.jpg');
    expect(result).toEqual({
      originalContentUrl: 'https://worker.example.com/images/incoming-acc-1-msg-vid.mp4',
      previewImageUrl: 'https://worker.example.com/images/incoming-acc-1-msg-vid-preview.jpg',
      mimeType: 'video/mp4',
      size: 200,
      durationMs: 3500,
    });
  });

  test('サムネ失敗でも動画 URL は返す', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/preview')) return new Response(null, { status: 404 });
      return new Response(new ArrayBuffer(80), {
        status: 200,
        headers: { 'Content-Type': 'video/mp4' },
      });
    });

    const result = await fetchAndStoreIncomingVideo({
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      workerUrl: 'https://worker.example.com/',
      channelAccessToken: 'token-abc',
      accountId: 'acc-1',
      messageId: 'msg-noprev',
    });

    expect(result?.originalContentUrl).toContain('.mp4');
    expect(result?.previewImageUrl).toBeUndefined();
    expect(r2.put).toHaveBeenCalledTimes(1);
  });

  test('Content API が非 200 なら null', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
    const result = await fetchAndStoreIncomingVideo({
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      workerUrl: 'https://worker.example.com',
      channelAccessToken: 'bad',
      accountId: 'acc-1',
      messageId: 'missing',
    });
    expect(result).toBeNull();
    expect(r2.put).not.toHaveBeenCalled();
  });

  test('50MB 超は取らない', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () =>
      new Response(new ArrayBuffer(10), {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(INCOMING_VIDEO_MAX_BYTES + 1),
        },
      }),
    );
    const result = await fetchAndStoreIncomingVideo({
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      workerUrl: 'https://worker.example.com',
      channelAccessToken: 'token-abc',
      accountId: 'acc-1',
      messageId: 'huge',
    });
    expect(result).toBeNull();
    expect(r2.put).not.toHaveBeenCalled();
  });
});
