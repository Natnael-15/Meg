// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function loadAutomationRunner({ settingsState, activeWorkspace, executeTool, agentRunner }) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/automationRunner.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);

  runModule((id) => {
    if (id === 'events') return require('events');
    if (id === './settings') {
      return {
        get: (key) => settingsState[key],
        set: (key, value) => {
          settingsState[key] = value;
        },
      };
    }
    if (id === './workspace') {
      return {
        getActive: () => activeWorkspace,
      };
    }
    if (id === './tools') {
      return { executeTool };
    }
    if (id === './agentRunner') {
      return agentRunner;
    }
    if (id === './lmstudio') {
      return { completeChat: vi.fn(async () => 'Generated document content') };
    }
    if (id === './activityStore') {
      return { listEvents: () => [] };
    }
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/automationRunner.js'));

  return module.exports;
}

describe('automationRunner', () => {
  let settingsState;
  let activeWorkspace;
  let executeTool;
  let agentRunner;
  let automationRunner;

  beforeEach(() => {
    vi.useFakeTimers();
    settingsState = {
      automationRuns: [],
    };
    activeWorkspace = { id: 'ws-1', path: 'C:\\repo' };
    executeTool = vi.fn(async () => ({ ok: true }));
    agentRunner = {
      createRun: vi.fn((input) => ({ id: 'agent-1', ...input })),
    };
    automationRunner = loadAutomationRunner({ settingsState, activeWorkspace, executeTool, agentRunner });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates queued automation runs and executes actions sequentially', async () => {
    const run = automationRunner.createRun({
      sourceId: 'auto-1',
      name: 'Deploy on merge',
      trigger: { type: 'repository', detail: 'on merge to main' },
      actions: [
        { id: 'a1', type: 'command', label: 'Run tests', target: 'npm test' },
        { id: 'a2', type: 'notify', label: 'Notify team', target: 'Deploy finished' },
      ],
    });

    expect(run.status).toBe('queued');

    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();

    const finished = automationRunner.listRuns().find((item) => item.id === run.id);
    expect(finished.status).toBe('done');
    expect(finished.actions.every((action) => action.status === 'done')).toBe(true);
    expect(executeTool).toHaveBeenNthCalledWith(
      1,
      'run_command',
      { command: 'npm test', cwd: 'C:\\repo' },
      expect.objectContaining({ threadId: run.id, workspacePath: 'C:\\repo', bypassPermissions: true }),
    );
    expect(executeTool).toHaveBeenNthCalledWith(
      2,
      'send_telegram',
      { text: 'Deploy finished' },
      expect.objectContaining({ threadId: run.id, workspacePath: 'C:\\repo', bypassPermissions: true }),
    );
  });

  it('spawns agent runs for agent_run actions', async () => {
    const run = automationRunner.createRun({
      sourceId: 'auto-2',
      name: 'PR review',
      trigger: { type: 'pull_request', detail: 'on PR opened' },
      actions: [
        { id: 'a1', type: 'agent_run', label: 'Run pr-reviewer', target: 'pr-reviewer' },
      ],
    });

    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();

    expect(agentRunner.createRun).toHaveBeenCalledWith(expect.objectContaining({
      name: 'pr-reviewer',
      instruction: 'Run pr-reviewer',
      parentThreadId: run.id,
      source: 'automation-action',
      sourceId: 'a1',
    }));
  });

  it('marks runs as error when an action fails', async () => {
    executeTool = vi.fn(async () => ({ error: 'command failed' }));
    automationRunner = loadAutomationRunner({ settingsState, activeWorkspace, executeTool, agentRunner });

    const run = automationRunner.createRun({
      sourceId: 'auto-3',
      name: 'Broken automation',
      actions: [{ id: 'a1', type: 'command', label: 'Run tests', target: 'npm test' }],
    });

    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();

    const failed = automationRunner.listRuns().find((item) => item.id === run.id);
    expect(failed.status).toBe('error');
    expect(failed.actions[0].status).toBe('error');
    expect(failed.error).toContain('command failed');
  });

  it('prunes older completed automation runs while preserving active ones', () => {
    settingsState.automationRuns = [
      { id: 'active-queued', status: 'queued', updatedAt: '2026-04-29T12:00:00.000Z', logs: [] },
      ...Array.from({ length: 210 }, (_, index) => ({
        id: `done-${index}`,
        status: 'done',
        updatedAt: new Date(2026, 3, 29, 11, 0, 210 - index).toISOString(),
        logs: Array.from({ length: 250 }, (__unused, logIndex) => ({ ts: `log-${logIndex}`, level: 'info', message: `line ${logIndex}` })),
        actions: [],
      })),
    ];
    automationRunner = loadAutomationRunner({ settingsState, activeWorkspace, executeTool, agentRunner });

    const run = automationRunner.createRun({
      sourceId: 'auto-retention',
      name: 'Retention check',
      actions: [],
    });

    const runs = automationRunner.listRuns();
    expect(runs.length).toBe(200);
    expect(runs.some((item) => item.id === 'active-queued')).toBe(true);
    expect(runs.some((item) => item.id === run.id)).toBe(true);
    expect(runs.some((item) => item.id === 'done-209')).toBe(false);
    const retainedCompleted = runs.find((item) => item.id === 'done-0');
    expect(retainedCompleted.logs.length).toBe(200);
  });
});
