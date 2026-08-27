import { describe, expect, test } from 'vitest';
import { Hono } from 'hono';
import { files } from './files.js';

const PDF_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function mockObject(bytes: Uint8Array) {
  return {
    body: bytes,
    etag: 'etag-1',
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { originalFilename: '見積書.pdf', source: 'incoming' },
  };
}

describe('GET /files and /pdf for incoming PDFs', () => {
  function setupApp(object: ReturnType<typeof mockObject> | null) {
    const app = new Hono();
    app.route('/', files);
    const env = {
      IMAGES: {
        get: async (key: string) => (key === `files/${PDF_ID}.pdf` ? object : null),
        head: async (key: string) => (key === `files/${PDF_ID}.pdf` ? object : null),
      },
      WORKER_URL: 'https://worker.example.com',
    };
    return { app, env };
  }

  test('PDF 本体は CORS 付きで inline 配信する', async () => {
    const { app, env } = setupApp(mockObject(new Uint8Array([1, 2, 3])));
    const res = await app.request(
      `/files/${PDF_ID}/%E8%A6%8B%E7%A9%8D%E6%9B%B8.pdf`,
      { method: 'GET' },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Content-Disposition')).toContain('inline');
    expect(await res.arrayBuffer()).toHaveProperty('byteLength', 3);
  });

  test('ビューア HTML を返す', async () => {
    const { app, env } = setupApp(mockObject(new Uint8Array([1])));
    const res = await app.request(`/pdf/${PDF_ID}`, { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('見積書.pdf');
    expect(html).toContain('/files/');
    expect(html).toContain('embed');
  });
});
