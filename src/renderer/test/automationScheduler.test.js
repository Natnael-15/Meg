// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function loadAutomationScheduler({ automations, automationRunner, workspaces = [], getHeadSnapshot = vi.fn(async () => null) }) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/automationScheduler.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);

  runModule((id) => {
    if (id === './db') {
      return {
        load: vi.fn(() => automations),
      };
    }
    if (id === './automationRunner') {
      return automationRunner;
    }
    if (id === './workspace') {
      return {
        list: () => workspaces,
      };
    }
    if (id === './git') {
      return {
        getHeadSnapshot,
      };
    }
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/automationScheduler.js'));

  return module.exports;
}

describe('automationScheduler', () => {
  let automationRunner;
  let scheduler;
  let automations;
  let workspaces;
  let getHeadSnapshot;

  beforeEach(() => {
    vi.useFakeTimers();
    automationRunner = {
      createRun: vi.fn((input) => ({ id: 'run-1', ...input })),
    };
    automations = [];
    workspaces = [];
    getHeadSnapshot = vi.fn(async () => null);
    scheduler = loadAutomationScheduler({ automations, automationRunner, workspaces, getHeadSnapshot });
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  it('parses supported schedule strings', () => {
    expect(scheduler.parseSchedule('Every Friday 5pm')).toEqual({ day: 5, hour: 17, minute: 0 });
    expect(scheduler.parseSchedule('Every day 9:30am')).toEqual({ day: 'day', hour: 9, minute: 30 });
    expect(scheduler.parseSchedule('nonsense')).toBeNull();
  });

  it('triggers enabled scheduled automations once per matching minute', async () => {
    automations.push({
      id: 'auto-1',
      name: 'Weekly report',
      enabled: true,
      trigger: { type: 'schedule', detail: 'Every Friday 5pm' },
      actions: [{ id: 'a1', type: 'notify', label: 'Send update', target: 'Telegram owner' }],
    });

    const date = new Date('2026-05-01T17:00:10');
    const first = await scheduler.tick(date);
    const second = await scheduler.tick(date);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(automationRunner.createRun).toHaveBeenCalledWith(expect.objectContaining({
      automationId: 'auto-1',
      name: 'Weekly report',
      sourceId: 'auto-1',
    }));
  });

  it('does not trigger disabled or non-schedule automations', async () => {
    automations.push(
      {
        id: 'auto-1',
        name: 'Disabled report',
        enabled: false,
        trigger: { type: 'schedule', detail: 'Every Friday 5pm' },
        actions: [],
      },
      {
        id: 'auto-2',
        name: 'Manual only',
        enabled: true,
        trigger: { type: 'manual', detail: 'Run from the app' },
        actions: [],
      },
    );

    const runs = await scheduler.tick(new Date('2026-05-01T17:00:00'));
    expect(runs).toHaveLength(0);
    expect(automationRunner.createRun).not.toHaveBeenCalled();
  });

  it('parses supported repository trigger strings', () => {
    expect(scheduler.parseRepositoryTrigger('on commit to main')).toEqual({ kind: 'commit', branch: 'main' });
    expect(scheduler.parseRepositoryTrigger('on merge to develop')).toEqual({ kind: 'merge', branch: 'develop' });
    expect(scheduler.parseRepositoryTrigger('nonsense')).toBeNull();
  });

  it('parses telegram keyword triggers', () => {
    expect(scheduler.parseTelegramTrigger('keyword: deploy status')).toBe('deploy status');
    expect(scheduler.parseTelegramTrigger('  urgent  ')).toBe('urgent');
    expect(scheduler.parseTelegramTrigger('')).toBeNull();
  });

  it('triggers repository automations when workspace HEAD changes on the target branch', async () => {
    workspaces.push({ id: 'ws-1', path: 'C:\\repo' });
    getHeadSnapshot = vi.fn(async () => ({ branch: 'main', head: 'abc123', parentCount: 1 }));
    scheduler = loadAutomationScheduler({ automations, automationRunner, workspaces, getHeadSnapshot });
    automations.push({
      id: 'auto-repo',
      name: 'Commit automation',
      enabled: true,
      trigger: { type: 'repository', detail: 'on commit to main' },
      actions: [],
    });

    const first = await scheduler.tick(new Date('2026-05-01T17:00:00'));
    const second = await scheduler.tick(new Date('2026-05-01T17:00:10'));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(automationRunner.createRun).toHaveBeenCalledWith(expect.objectContaining({
      automationId: 'auto-repo',
      workspaceId: 'ws-1',
      workspacePath: 'C:\\repo',
    }));
  });

  it('requires merge commits for merge-based repository automations', async () => {
    workspaces.push({ id: 'ws-1', path: 'C:\\repo' });
    automations.push({
      id: 'auto-merge',
      name: 'Merge automation',
      enabled: true,
      trigger: { type: 'repository', detail: 'on merge to main' },
      actions: [],
    });

    getHeadSnapshot = vi.fn(async () => ({ branch: 'main', head: 'abc123', parentCount: 1 }));
    scheduler = loadAutomationScheduler({ automations, automationRunner, workspaces, getHeadSnapshot });
    expect(await scheduler.tick(new Date('2026-05-01T17:00:00'))).toHaveLength(0);

    getHeadSnapshot = vi.fn(async () => ({ branch: 'main', head: 'def456', parentCount: 2 }));
    scheduler = loadAutomationScheduler({ automations, automationRunner, workspaces, getHeadSnapshot });
    expect(await scheduler.tick(new Date('2026-05-01T17:01:00'))).toHaveLength(1);
  });

  it('triggers telegram automations once per matching message', () => {
    automations.push({
      id: 'auto-telegram',
      name: 'Telegram alert',
      enabled: true,
      trigger: { type: 'telegram', detail: 'keyword: deploy status' },
      actions: [{ id: 'a1', type: 'notify', label: 'Send update', target: 'Owner' }],
    });

    const message = {
      chat: { id: 42 },
      from: { first_name: 'Nat' },
      text: 'Need deploy status for production',
      date: 1714400000,
      message_id: 99,
    };

    const first = scheduler.handleTelegramMessage(message);
    const second = scheduler.handleTelegramMessage(message);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(automationRunner.createRun).toHaveBeenCalledWith(expect.objectContaining({
      automationId: 'auto-telegram',
      sourceId: 'auto-telegram',
    }));
  });
});
