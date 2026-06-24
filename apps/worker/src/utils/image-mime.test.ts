import { describe, expect, test } from 'vitest';
import { resolveUploadedImageMimeType, sniffImageMimeType } from './image-mime.js';

describe('sniffImageMimeType', () => {
  test('detects PNG', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffImageMimeType(png.buffer)).toBe('image/png');
  });

  test('detects JPEG', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(sniffImageMimeType(jpeg.buffer)).toBe('image/jpeg');
  });
});

describe('resolveUploadedImageMimeType', () => {
  test('sniffs octet-stream uploads from mobile Safari', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(resolveUploadedImageMimeType('application/octet-stream', png.buffer)).toBe('image/png');
  });
});
