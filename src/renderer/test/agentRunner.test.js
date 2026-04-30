// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function loadAgentRunner({ settingsState, activeWorkspace, streamChat }) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/agentRunner.js'), 'utf8');
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
    if (id === './lmstudio') {
      return { streamChat };
    }
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/agentRunner.js'));

  return module.exports;
}

describe('agentRunner', () => {
  let settingsState;
  let activeWorkspace;
  let streamChat;
  let agentRunner;

  beforeEach(() => {
    vi.useFakeTimers();
    settingsState = {
      agentRuns: [],
      model: 'qwen/qwen3.5-9b',
      lmStudioUrl: 'http://127.0.0.1:1234',
    };
    activeWorkspace = { id: 'ws-1', path: 'C:\\repo' };
    streamChat = vi.fn(async function* () {
      yield { type: 'text', content: 'Working...' };
    });
    agentRunner = loadAgentRunner({ settingsState, activeWorkspace, streamChat });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates queued runs and completes them after the scheduled stream', async () => {
    const run = agentRunner.createRun({
      name: 'review-auth',
      instruction: 'Inspect auth middleware',
      parentThreadId: 'thread-1',
      model: 'gpt-4o',
    });

    expect(run.status).toBe('queued');
    expect(settingsState.agentRuns[0]).toMatchObject({
      id: run.id,
      status: 'queued',
      workspaceId: 'ws-1',
      workspacePath: 'C:\\repo',
      model: 'gpt-4o',
    });

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();

    const completed = agentRunner.listRuns().find((item) => item.id === run.id);
    expect(completed.status).toBe('done');
    expect(completed.startedAt).toBeTruthy();
    expect(completed.completedAt).toBeTruthy();
    expect(completed.output.text).toBe('Working...');
    expect(completed.steps.every((step) => step.status === 'done')).toBe(true);
    expect(streamChat).toHaveBeenCalledWith(
      expect.any(Array),
      run.id,
      'gpt-4o',
      true,
      'http://127.0.0.1:1234',
      expect.objectContaining({
        workspacePath: 'C:\\repo',
        agentRunId: run.id,
      }),
    );
  });

  it('cancels queued runs before they start', () => {
    const run = agentRunner.createRun({
      name: 'cancel-me',
      instruction: 'Stop before running',
    });

    const cancelled = agentRunner.cancelRun(run.id);

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.completedAt).toBeTruthy();
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('marks runs as error when the stream throws', async () => {
    streamChat = vi.fn(async function* () {
      throw new Error('model crashed');
    });
    agentRunner = loadAgentRunner({ settingsState, activeWorkspace, streamChat });

    const run = agentRunner.createRun({
      name: 'unstable-run',
      instruction: 'Trigger failure',
    });

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();

    const failed = agentRunner.listRuns().find((item) => item.id === run.id);
    expect(failed.status).toBe('error');
    expect(failed.error).toBe('model crashed');
  });

  it('records structured tool activity for backend file writes', async () => {
    streamChat = vi.fn(async function* () {
      yield { type: 'tool_call', id: 'tool-1', name: 'write_file', args: { path: 'C:\\repo\\src\\draft.js', content: 'const value = 2;' } };
      yield { type: 'tool_result', id: 'tool-1', name: 'write_file', result: { ok: true, path: 'C:\\repo\\src\\draft.js' } };
      yield { type: 'text', content: 'Wrote the requested file.' };
    });
    agentRunner = loadAgentRunner({ settingsState, activeWorkspace, streamChat });

    const run = agentRunner.createRun({
      name: 'write-draft',
      instruction: 'Update src\\draft.js',
    });

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();

    const completed = agentRunner.listRuns().find((item) => item.id === run.id);
    expect(completed.toolActivity).toEqual([
      expect.objectContaining({
        id: 'tool-1',
        name: 'write_file',
        status: 'done',
        args: expect.objectContaining({ path: 'C:\\repo\\src\\draft.js' }),
        result: expect.objectContaining({ ok: true, path: 'C:\\repo\\src\\draft.js' }),
      }),
    ]);
  });

  it('keeps approval-staged backend file writes reviewable in tool activity', async () => {
    streamChat = vi.fn(async function* () {
      yield { type: 'tool_call', id: 'tool-1', name: 'write_file', args: { path: 'C:\\repo\\src\\draft.js', content: 'const value = 2;' } };
      yield {
        type: 'tool_result',
        id: 'tool-1',
        name: 'write_file',
        result: {
          approvalRequired: true,
          error: 'File write requires approval. Approval ID: approval-1',
          approval: {
            id: 'approval-1',
            tool: 'write_file',
            toolCallId: 'tool-1',
            result: {
              staged: true,
              path: 'C:\\repo\\src\\draft.js',
              originalContent: 'const value = 1;',
            },
          },
        },
      };
      yield { type: 'text', content: 'Prepared a draft for review.' };
    });
    agentRunner = loadAgentRunner({ settingsState, activeWorkspace, streamChat });

    const run = agentRunner.createRun({
      name: 'stage-draft',
      instruction: 'Stage src\\draft.js for review',
    });

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();

    const completed = agentRunner.listRuns().find((item) => item.id === run.id);
    expect(completed.toolActivity).toEqual([
      expect.objectContaining({
        id: 'tool-1',
        name: 'write_file',
        status: 'staged',
        result: expect.objectContaining({
          approvalRequired: true,
          approval: expect.objectContaining({
            id: 'approval-1',
            result: expect.objectContaining({
              staged: true,
              path: 'C:\\repo\\src\\draft.js',
            }),
          }),
        }),
      }),
    ]);
  });

  it('prunes older completed runs while preserving active ones', () => {
    settingsState.agentRuns = [
      { id: 'active-running', status: 'running', updatedAt: '2026-04-29T12:00:00.000Z', logs: [] },
      ...Array.from({ length: 210 }, (_, index) => ({
        id: `done-${index}`,
        status: 'done',
        updatedAt: new Date(2026, 3, 29, 11, 0, 210 - index).toISOString(),
        logs: Array.from({ length: 250 }, (__unused, logIndex) => ({ ts: `log-${logIndex}`, level: 'info', message: `line ${logIndex}` })),
      })),
    ];
    agentRunner = loadAgentRunner({ settingsState, activeWorkspace, streamChat });

    const run = agentRunner.createRun({
      name: 'retention-check',
      instruction: 'Verify pruning',
    });

    const runs = agentRunner.listRuns();
    expect(runs.length).toBe(200);
    expect(runs.some((item) => item.id === 'active-running')).toBe(true);
    expect(runs.some((item) => item.id === run.id)).toBe(true);
    expect(runs.some((item) => item.id === 'done-209')).toBe(false);
    const retainedCompleted = runs.find((item) => item.id === 'done-0');
    expect(retainedCompleted.logs.length).toBe(200);
  });
});
