import { describe, expect, test } from 'vitest';
import { renderChatPdfViewerPage } from './chat-pdf-viewer-page.js';

describe('renderChatPdfViewerPage', () => {
  test('escapes HTML in filename', () => {
    const html = renderChatPdfViewerPage({
      fileName: '<script>alert(1)</script>.pdf',
      pdfUrl: 'https://example.com/files/x/a.pdf',
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<title>&lt;script&gt;');
  });

  test('includes share save button and pdf url in script', () => {
    const html = renderChatPdfViewerPage({
      fileName: '見積書.pdf',
      pdfUrl: 'https://example.com/files/u/見積書.pdf',
      expiresAtLabel: '2026/7/15 12:00',
    });
    expect(html).toContain('ファイルに保存');
    expect(html).toContain('navigator.share({ files: [file] })');
    expect(html).not.toContain('PDFを別タブで開く');
    expect(html).not.toContain('iPhone の場合');
  });
});
