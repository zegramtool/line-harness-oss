import { describe, expect, test } from 'vitest';
import {
  normalizeScheduledAtInput,
  parseScheduledAtMs,
} from '../src/scheduled-messages.js';

describe('normalizeScheduledAtInput', () => {
  test('datetime-local to JST ISO', () => {
    expect(normalizeScheduledAtInput('2026-06-16T08:00')).toBe('2026-06-16T08:00:00.000+09:00');
  });

  test('passes through ISO with offset', () => {
    const iso = '2026-06-16T08:00:00.000+09:00';
    expect(normalizeScheduledAtInput(iso)).toBe(iso);
  });

  test('converts UTC Z to JST ISO', () => {
    expect(normalizeScheduledAtInput('2026-06-22T03:00:00.000Z')).toBe('2026-06-22T12:00:00.000+09:00');
  });
});

describe('parseScheduledAtMs', () => {
  test('parses datetime-local as future-capable timestamp', () => {
    const ms = parseScheduledAtMs('2026-06-16T08:00');
    expect(Number.isFinite(ms)).toBe(true);
  });
});
