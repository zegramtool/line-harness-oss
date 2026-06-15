import { describe, expect, test } from 'vitest';
import {
  buildContentDispositionHeader,
  sanitizeDownloadFilename,
} from './content-disposition.js';

describe('sanitizeDownloadFilename', () => {
  test('keeps basename and pdf extension', () => {
    expect(sanitizeDownloadFilename('/path/見積書.pdf')).toBe('見積書.pdf');
    expect(sanitizeDownloadFilename('report')).toBe('report.pdf');
  });

  test('falls back for empty', () => {
    expect(sanitizeDownloadFilename('')).toBe('document.pdf');
    expect(sanitizeDownloadFilename('   ')).toBe('document.pdf');
  });
});

describe('buildContentDispositionHeader', () => {
  test('includes UTF-8 filename* for non-ASCII names', () => {
    const header = buildContentDispositionHeader('見積書.pdf');
    expect(header).toMatch(/^inline;/);
    expect(header).toContain('filename="___.pdf"');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain('%E8%A6%8B%E7%A9%8D%E6%9B%B8.pdf');
  });

  test('keeps ASCII filename readable', () => {
    const header = buildContentDispositionHeader('estimate-2026.pdf');
    expect(header).toContain('filename="estimate-2026.pdf"');
    expect(header).toContain("filename*=UTF-8''estimate-2026.pdf");
  });
});
