import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatEventDate, formatRelativeTime } from '../lib/time.js';

describe('time formatting', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats recent relative times from timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T12:00:00.000Z'));

    expect(formatRelativeTime('2026-04-29T11:59:45.000Z')).toBe('just now');
    expect(formatRelativeTime('2026-04-29T11:55:00.000Z')).toBe('5m ago');
    expect(formatRelativeTime('2026-04-29T09:00:00.000Z')).toBe('3h ago');
  });

  it('formats event date groups from timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T12:00:00.000Z'));

    expect(formatEventDate('2026-04-29T09:00:00.000Z')).toBe('Today');
    expect(formatEventDate('2026-04-28T09:00:00.000Z')).toBe('Yesterday');
    expect(formatEventDate('2026-04-20T09:00:00.000Z')).toContain('Apr');
  });
});
