import { describe, expect, it } from 'vitest';
import { deriveThreadSummary, normalizeThreadList } from '../lib/threads.js';

describe('thread schema helpers', () => {
  it('derives thread title and subtitle from real message history', () => {
    const summary = deriveThreadSummary({
      title: 'New chat',
      subtitle: 'Start a conversation',
      messages: [
        { id: 1, role: 'user', text: 'Review the failing login flow in detail' },
        { id: 2, role: 'meg', text: 'I found the auth regression in the cookie path.' },
      ],
    });

    expect(summary.title).toContain('Review the failing login flow');
    expect(summary.subtitle).toContain('I found the auth regression');
  });

  it('sorts threads by updatedAt activity descending', () => {
    const threads = normalizeThreadList([
      { id: 'older', updatedAt: '2026-04-29T10:00:00.000Z', messages: [{ role: 'user', text: 'older thread' }] },
      { id: 'newer', updatedAt: '2026-04-29T11:00:00.000Z', messages: [{ role: 'user', text: 'newer thread' }] },
    ]);

    expect(threads.map((thread) => thread.id)).toEqual(['newer', 'older']);
  });
});
