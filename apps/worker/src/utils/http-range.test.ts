import { describe, expect, test } from 'vitest';
import { parseHttpBytesRange } from './http-range.js';

describe('parseHttpBytesRange', () => {
  test('bytes=0-1', () => {
    expect(parseHttpBytesRange('bytes=0-1', 100)).toEqual({ offset: 0, length: 2 });
  });

  test('open end', () => {
    expect(parseHttpBytesRange('bytes=10-', 20)).toEqual({ offset: 10, length: 10 });
  });

  test('suffix', () => {
    expect(parseHttpBytesRange('bytes=-5', 20)).toEqual({ offset: 15, length: 5 });
  });

  test('invalid is null', () => {
    expect(parseHttpBytesRange('bytes=50-10', 20)).toBeNull();
    expect(parseHttpBytesRange(undefined, 20)).toBeNull();
  });
});
