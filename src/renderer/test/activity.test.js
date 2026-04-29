import { describe, expect, it, vi } from 'vitest';
import {
  dismissNotification,
  markAllNotificationsRead,
  normalizeEventList,
  normalizeNotificationList,
  upsertEvent,
  upsertNotification,
} from '../lib/activity.js';

describe('activity helpers', () => {
  it('dedupes and sorts notifications by createdAt descending', () => {
    const notifications = normalizeNotificationList([
      { id: 'a', title: 'Older', createdAt: '2026-04-29T09:00:00.000Z' },
      { id: 'a', title: 'Duplicate', createdAt: '2026-04-29T10:00:00.000Z' },
      { id: 'b', title: 'Newest', createdAt: '2026-04-29T11:00:00.000Z' },
    ]);

    expect(notifications.map((item) => item.id)).toEqual(['b', 'a']);
    expect(notifications[0]).toEqual(expect.objectContaining({ title: 'Newest', read: false }));
  });

  it('upserts notifications by deterministic id and marks them read', () => {
    const first = upsertNotification([], { id: 'notif:1', title: 'Hello', createdAt: '2026-04-29T09:00:00.000Z' });
    const second = upsertNotification(first, { id: 'notif:1', title: 'Updated', createdAt: '2026-04-29T10:00:00.000Z' });
    const read = markAllNotificationsRead(second);

    expect(second).toHaveLength(1);
    expect(second[0]).toEqual(expect.objectContaining({ id: 'notif:1', title: 'Updated' }));
    expect(read[0].read).toBe(true);
    expect(dismissNotification(read, 'notif:1')).toEqual([]);
  });

  it('dedupes and retains newest events first', () => {
    const events = normalizeEventList([
      { id: 'evt:1', title: 'Older', detail: '', createdAt: '2026-04-29T09:00:00.000Z' },
      { id: 'evt:2', title: 'Newest', detail: '', createdAt: '2026-04-29T11:00:00.000Z' },
      { id: 'evt:1', title: 'Duplicate', detail: '', createdAt: '2026-04-29T10:00:00.000Z' },
    ]);

    expect(events.map((item) => item.id)).toEqual(['evt:2', 'evt:1']);
  });

  it('caps retained activity sizes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T12:00:00.000Z'));

    const notifications = normalizeNotificationList(Array.from({ length: 205 }, (_, index) => ({
      id: `notif:${index}`,
      title: `Notification ${index}`,
      createdAt: new Date(2026, 3, 29, 12, 0, index).toISOString(),
    })));
    const events = normalizeEventList(Array.from({ length: 505 }, (_, index) => ({
      id: `event:${index}`,
      title: `Event ${index}`,
      detail: '',
      createdAt: new Date(2026, 3, 29, 12, 0, index).toISOString(),
    })));

    expect(notifications).toHaveLength(200);
    expect(events).toHaveLength(500);

    vi.useRealTimers();
  });

  it('upserts events by id', () => {
    const first = upsertEvent([], { id: 'evt:1', title: 'Created', detail: 'detail', createdAt: '2026-04-29T09:00:00.000Z' });
    const second = upsertEvent(first, { id: 'evt:1', title: 'Updated', detail: 'detail', createdAt: '2026-04-29T10:00:00.000Z' });

    expect(second).toHaveLength(1);
    expect(second[0]).toEqual(expect.objectContaining({ id: 'evt:1', title: 'Updated' }));
  });
});
