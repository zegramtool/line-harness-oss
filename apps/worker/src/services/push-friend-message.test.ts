import { describe, expect, test } from 'vitest';
import { parseImagePayloads, MAX_IMAGES_PER_PUSH } from './push-friend-message.js';

describe('parseImagePayloads', () => {
  const one = {
    originalContentUrl: 'https://example.com/a.jpg',
    previewImageUrl: 'https://example.com/a-preview.jpg',
  };

  test('parses single image object', () => {
    expect(parseImagePayloads(JSON.stringify(one))).toEqual([one]);
  });

  test('parses image array for batch push', () => {
    const two = [one, { ...one, originalContentUrl: 'https://example.com/b.jpg' }];
    expect(parseImagePayloads(JSON.stringify(two))).toHaveLength(2);
  });

  test('rejects more than max images', () => {
    const many = Array.from({ length: MAX_IMAGES_PER_PUSH + 1 }, (_, i) => ({
      originalContentUrl: `https://example.com/${i}.jpg`,
      previewImageUrl: `https://example.com/${i}-p.jpg`,
    }));
    expect(() => parseImagePayloads(JSON.stringify(many))).toThrow();
  });
});
