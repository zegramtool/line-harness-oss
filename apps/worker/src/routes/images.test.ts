import { describe, expect, test } from 'vitest';
import { Hono } from 'hono';
import { images } from './images.js';

type Stored = { body: Uint8Array; contentType: string };

function makeR2(store: Map<string, Stored>) {
  return {
    async get(key: string, opts?: { range?: { offset: number; length: number } }) {
      const item = store.get(key);
      if (!item) return null;
      let body = item.body;
      if (opts?.range) {
        const { offset, length } = opts.range;
        body = item.body.subarray(offset, offset + length);
      }
      return {
        body,
        size: item.body.byteLength,
        etag: 'etag-1',
        httpMetadata: { contentType: item.contentType },
      };
    },
    async head(key: string) {
      const item = store.get(key);
      if (!item) return null;
      return {
        size: item.body.byteLength,
        etag: 'etag-1',
        httpMetadata: { contentType: item.contentType },
      };
    },
  };
}

function setupApp(store: Map<string, Stored>) {
  const app = new Hono();
  app.route('/', images);
  const env = {
    IMAGES: makeR2(store),
    WORKER_URL: 'https://worker.example.com',
  };
  return { app, env };
}

describe('GET /images/:key', () => {
  test('JPEG は Range が付いても 200 で全文返す（複数枚 LINE push 用）', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03, 0x04, 0x05]);
    const store = new Map<string, Stored>([
      ['photo.jpg', { body: jpeg, contentType: 'image/jpeg' }],
    ]);
    const { app, env } = setupApp(store);

    const res = await app.request(
      '/images/photo.jpg',
      { method: 'GET', headers: { Range: 'bytes=0-1' } },
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Accept-Ranges')).toBeNull();
    expect(res.headers.get('Content-Range')).toBeNull();
    expect(res.headers.get('Content-Length')).toBe(String(jpeg.byteLength));
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg);
  });

  test('PNG も head なしで 200 になる', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const store = new Map<string, Stored>([
      ['shot.png', { body: png, contentType: 'image/png' }],
    ]);
    const { app, env } = setupApp(store);
    const res = await app.request('/images/shot.png', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(await res.arrayBuffer()).toHaveProperty('byteLength', png.byteLength);
  });

  test('動画は Range 206 を返す', async () => {
    const mp4 = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const store = new Map<string, Stored>([
      ['incoming-acc-1-msg.mp4', { body: mp4, contentType: 'video/mp4' }],
    ]);
    const { app, env } = setupApp(store);

    const res = await app.request(
      '/images/incoming-acc-1-msg.mp4',
      { method: 'GET', headers: { Range: 'bytes=2-5' } },
      env,
    );

    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(res.headers.get('Content-Length')).toBe('4');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([2, 3, 4, 5]));
  });

  test('download=1 の動画は Range せず全文返す', async () => {
    const mp4 = new Uint8Array([0, 1, 2, 3, 4]);
    const store = new Map<string, Stored>([
      ['clip.mp4', { body: mp4, contentType: 'video/mp4' }],
    ]);
    const { app, env } = setupApp(store);

    const res = await app.request(
      '/images/clip.mp4?download=1',
      { method: 'GET', headers: { Range: 'bytes=0-1' } },
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(mp4);
  });

  test('無いキーは 404', async () => {
    const { app, env } = setupApp(new Map());
    const res = await app.request('/images/missing.jpg', { method: 'GET' }, env);
    expect(res.status).toBe(404);
  });
});
