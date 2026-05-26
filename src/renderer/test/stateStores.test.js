// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

function loadModule(modulePath, dbState) {
  const source = fs.readFileSync(modulePath, 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);

  runModule((id) => {
    if (id === './db') {
      return {
        load: vi.fn((table) => dbState[table] || []),
        saveAll: vi.fn((table, items) => {
          dbState[table] = items;
        }),
      };
    }
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.dirname(modulePath), modulePath);

  return module.exports;
}

describe('state stores', () => {
  it('normalizes persisted threads at load time', () => {
    const dbState = {
      threads: [{
        id: 'thread-1',
        title: 'New chat',
        subtitle: '',
        time: 'now',
        messages: [
          { role: 'user', text: 'Review the failing login flow in detail' },
          { role: 'meg', text: 'I found the auth regression in the cookie path.' },
        ],
        lastRunStatus: 'should-not-exist',
      }],
    };
    const service = loadModule(path.resolve(__dirname, '../../main/threadStore.js'), dbState);

    const items = service.list();

    expect(items[0]).toEqual(expect.objectContaining({
      schemaVersion: 1,
      id: 'thread-1',
      title: 'Review the failing login flow in detail',
      subtitle: 'I found the auth regression in the cookie path.',
      iconName: 'chat',
      unread: false,
      files: [],
      tools: {},
      memory: '',
    }));
    expect(dbState.threads[0].time).toBeUndefined();
  });

  it('caps thread history and per-thread message history', () => {
    const dbState = {
      threads: Array.from({ length: 205 }, (_, index) => ({
        id: `thread-${index}`,
        updatedAt: new Date(2026, 3, 29, 12, 0, 205 - index).toISOString(),
        messages: Array.from({ length: 510 }, (__unused, messageIndex) => ({
          id: `message-${messageIndex}`,
          role: 'user',
          text: `Message ${messageIndex}`,
        })),
      })),
    };
    const service = loadModule(path.resolve(__dirname, '../../main/threadStore.js'), dbState);

    const items = service.list();

    expect(items).toHaveLength(200);
    expect(items[0].id).toBe('thread-0');
    expect(items.at(-1).id).toBe('thread-199');
    expect(items[0].messages).toHaveLength(500);
    expect(items[0].messages[0].id).toBe('message-10');
  });

  it('supports incremental thread upsert and delete operations', () => {
    const dbState = { threads: [] };
    const service = loadModule(path.resolve(__dirname, '../../main/threadStore.js'), dbState);

    service.upsert({
      id: 'thread-1',
      messages: [{ role: 'user', text: 'Thread one' }],
      updatedAt: '2026-04-29T12:00:00.000Z',
    });
    service.upsert({
      id: 'thread-2',
      messages: [{ role: 'user', text: 'Thread two' }],
      updatedAt: '2026-04-29T12:01:00.000Z',
    });
    service.remove('thread-1');

    expect(dbState.threads.map((item) => item.id)).toEqual(['thread-2']);
  });

  it('normalizes and caps notifications and events at save time', () => {
    const dbState = { notifications: [], events: [] };
    const service = loadModule(path.resolve(__dirname, '../../main/activityStore.js'), dbState);

    const notifications = service.saveNotifications([
      { id: 'notif-1', title: 'Updated title', createdAt: '2026-04-29T10:00:00.000Z', read: 1 },
      { id: 'notif-1', title: '', createdAt: '2026-04-29T09:00:00.000Z' },
    ]);
    const events = service.saveEvents([
      { id: 'event-1', title: 'Updated event', detail: 'done', createdAt: '2026-04-29T10:00:00.000Z' },
      { id: 'event-1', title: '', detail: '', createdAt: '2026-04-29T09:00:00.000Z' },
    ]);

    expect(notifications).toEqual([expect.objectContaining({
      schemaVersion: 1,
      id: 'notif-1',
      title: 'Updated title',
      read: true,
    })]);
    expect(events).toEqual([expect.objectContaining({
      schemaVersion: 1,
      id: 'event-1',
      title: 'Updated event',
      detail: 'done',
    })]);
  });

  it('supports incremental notification and event upserts', () => {
    const dbState = { notifications: [], events: [] };
    const service = loadModule(path.resolve(__dirname, '../../main/activityStore.js'), dbState);

    service.upsertNotification({ id: 'notif-1', title: 'Needs review', read: false });
    service.markAllNotificationsRead();
    service.upsertEvent({ id: 'event-1', title: 'Run finished', detail: 'ok' });

    expect(dbState.notifications).toEqual([expect.objectContaining({ id: 'notif-1', read: true })]);
    expect(dbState.events).toEqual([expect.objectContaining({ id: 'event-1', title: 'Run finished' })]);
  });

  it('normalizes telegram messages and coerces chat ids to strings', () => {
    const dbState = {
      telegramMessages: [{
        id: 'tg-1',
        direction: 'outbound',
        from: '',
        text: 'Deployment is green',
        chatId: 42,
        date: 1714400000,
      }],
    };
    const service = loadModule(path.resolve(__dirname, '../../main/telegramStore.js'), dbState);

    const items = service.listMessages();

    expect(items).toEqual([expect.objectContaining({
      schemaVersion: 1,
      id: 'tg-1',
      direction: 'outbound',
      from: 'Meg',
      text: 'Deployment is green',
      chatId: '42',
      status: 'pending',
    })]);
  });

  it('caps telegram message history to the most recent retained items', () => {
    const dbState = {
      telegramMessages: Array.from({ length: 505 }, (_, index) => ({
        id: `tg-${index}`,
        direction: 'inbound',
        from: 'Nat',
        text: `Message ${index}`,
        chatId: 42,
        createdAt: new Date(2026, 3, 29, 12, 0, index).toISOString(),
      })),
    };
    const service = loadModule(path.resolve(__dirname, '../../main/telegramStore.js'), dbState);

    const items = service.listMessages();

    expect(items).toHaveLength(500);
    expect(items[0].id).toBe('tg-5');
    expect(items.at(-1).id).toBe('tg-504');
  });

  it('supports incremental telegram message upsert and delete operations', () => {
    const dbState = { telegramMessages: [] };
    const service = loadModule(path.resolve(__dirname, '../../main/telegramStore.js'), dbState);

    service.upsertMessage({ id: 'tg-1', text: 'hello', chatId: 42, createdAt: '2026-04-29T12:00:00.000Z' });
    service.upsertMessage({ id: 'tg-1', text: 'hello again', chatId: 42, createdAt: '2026-04-29T12:00:01.000Z' });
    service.removeMessage('tg-1');

    expect(dbState.telegramMessages).toEqual([]);
  });
});
