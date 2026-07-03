// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function loadAgentRunner({ settingsState, activeWorkspace, streamChat, getClient, getClientForModel }) {
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
      return { streamChat, getClient, getClientForModel };
    }
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/agentRunner.js'));

  return module.exports;
}

describe('agentRunner', () => {
  let settingsState;
  let activeWorkspace;
  let streamChat;
  let getClient;
  let getClientForModel;
  let agentRunner;

  beforeEach(() => {
    vi.useFakeTimers();
    settingsState = {
      agentRuns: [],
      model: 'qwen/qwen3-8b',
      lmStudioUrl: 'http://127.0.0.1:1234',
    };
    activeWorkspace = { id: 'ws-1', path: 'C:\\repo' };
    streamChat = vi.fn(async function* () {
      yield { type: 'text', content: 'Working...' };
    });
    getClient = vi.fn(() => ({
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify([
                    { label: 'Inspect files', type: 'research' },
                    { label: 'Implement change', type: 'implementation' },
                    { label: 'Verify result', type: 'verification' },
                  ]),
                },
              },
            ],
          })),
        },
      },
    }));
    getClientForModel = getClient;
    agentRunner = loadAgentRunner({ settingsState, activeWorkspace, streamChat, getClient, getClientForModel });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates queued runs and completes them after the scheduled stream', async () => {
    const run = await agentRunner.createRun({
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

  it('cancels queued runs before they start', async () => {
    const run = await agentRunner.createRun({
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
    agentRunner = loadAgentRunner({ settingsState, activeWorkspace, streamChat, getClient, getClientForModel });

    const run = await agentRunner.createRun({
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
    agentRunner = loadAgentRunner({ settingsState, activeWorkspace, streamChat, getClient, getClientForModel });

    const run = await agentRunner.createRun({
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
    agentRunner = loadAgentRunner({ settingsState, activeWorkspace, streamChat, getClient, getClientForModel });

    const run = await agentRunner.createRun({
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

  it('prunes older completed runs while preserving active ones', async () => {
    settingsState.agentRuns = [
      { id: 'active-running', status: 'running', updatedAt: '2026-04-29T12:00:00.000Z', logs: [] },
      ...Array.from({ length: 210 }, (_, index) => ({
        id: `done-${index}`,
        status: 'done',
        updatedAt: new Date(2026, 3, 29, 11, 0, 210 - index).toISOString(),
        logs: Array.from({ length: 250 }, (__unused, logIndex) => ({ ts: `log-${logIndex}`, level: 'info', message: `line ${logIndex}` })),
      })),
    ];
    agentRunner = loadAgentRunner({ settingsState, activeWorkspace, streamChat, getClient, getClientForModel });

    const run = await agentRunner.createRun({
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

  it('cleans up running and queued agent runs on module initialization', () => {
    const customSettingsState = {
      agentRuns: [
        { id: 'stale-running', status: 'running', logs: [] },
        { id: 'stale-queued', status: 'queued', logs: [] },
        { id: 'legit-done', status: 'done', logs: [] }
      ],
      model: 'qwen/qwen3-8b',
      lmStudioUrl: 'http://127.0.0.1:1234',
    };
    const runner = loadAgentRunner({ settingsState: customSettingsState, activeWorkspace, streamChat, getClient, getClientForModel });
    const runs = customSettingsState.agentRuns;
    const staleRunning = runs.find(r => r.id === 'stale-running');
    const staleQueued = runs.find(r => r.id === 'stale-queued');
    const legitDone = runs.find(r => r.id === 'legit-done');

    expect(staleRunning.status).toBe('cancelled');
    expect(staleRunning.logs.some(l => l.message.includes('interrupted'))).toBe(true);
    expect(staleQueued.status).toBe('cancelled');
    expect(staleQueued.logs.some(l => l.message.includes('cancelled on startup'))).toBe(true);
    expect(legitDone.status).toBe('done');
  });

  it('plans goal runs from markdown-wrapped JSON and advances through reported steps', async () => {
    streamChat = vi.fn(async function* (messages) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'system' && String(lastMessage.content).includes('VERIFICATION AND ITERATION PHASE')) {
        yield { type: 'text', content: 'Verification complete.' };
        return;
      }
      yield { type: 'text', content: '[STEP] Starting: Step 1\nInspecting.\n' };
      yield { type: 'tool_call', id: 'tool-1', name: 'read_file', args: { path: 'C:\\repo\\src\\index.js' } };
      yield { type: 'tool_result', id: 'tool-1', name: 'read_file', result: { ok: true, content: 'ok' } };
      yield { type: 'text', content: '[STEP] Starting: Step 2\nImplementing.\n[STEP] Starting: Step 3\nWrapping up.' };
    });
    getClientForModel = vi.fn(() => ({
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [
              {
                message: {
                  content: "```json\n[\n  {\"label\":\"Inspect files\",\"type\":\"research\"},\n  {\"label\":\"Implement fix\",\"type\":\"implementation\"},\n  {\"label\":\"Verify result\",\"type\":\"verification\"}\n]\n```",
                },
              },
            ],
          })),
        },
      },
    }));
    agentRunner = loadAgentRunner({ settingsState, activeWorkspace, streamChat, getClient, getClientForModel });

    const run = await agentRunner.createRun({
      name: 'goal-run',
      instruction: 'Fix the bug end to end',
      goal: true,
    });

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();

    const completed = agentRunner.listRuns().find((item) => item.id === run.id);
    expect(getClientForModel).toHaveBeenCalledWith('qwen/qwen3-8b', 'http://127.0.0.1:1234');
    expect(completed.status).toBe('done');
    expect(completed.steps.map((step) => step.label)).toEqual([
      'Queued',
      'Planning workflow',
      'Inspect files',
      'Implement fix',
      'Verify result',
      'Verifying and iterating on results',
    ]);
    expect(completed.steps.every((step) => step.status === 'done')).toBe(true);
    expect(completed.toolActivity).toEqual([
      expect.objectContaining({
        id: 'tool-1',
        name: 'read_file',
        status: 'done',
      }),
    ]);
    expect(completed.output.text).toContain('[VERIFICATION REPORT]');
  });

  it('falls back to default goal workflow when planning JSON is invalid', async () => {
    getClientForModel = vi.fn(() => ({
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content: 'not json at all' } }],
          })),
        },
      },
    }));
    streamChat = vi.fn(async function* (messages) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'system' && String(lastMessage.content).includes('VERIFICATION AND ITERATION PHASE')) {
        yield { type: 'text', content: 'Verified.' };
        return;
      }
      yield { type: 'text', content: 'Finished execution.' };
    });
    agentRunner = loadAgentRunner({ settingsState, activeWorkspace, streamChat, getClient, getClientForModel });

    const run = await agentRunner.createRun({
      name: 'goal-fallback',
      instruction: 'Do the work',
      goal: true,
    });

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();

    const completed = agentRunner.listRuns().find((item) => item.id === run.id);
    expect(completed.status).toBe('done');
    expect(completed.steps.map((step) => step.label)).toEqual([
      'Queued',
      'Planning workflow',
      'Analyze codebase and requirements',
      'Implement requirements in workspace',
      'Verify correct implementation and polish',
      'Verifying and iterating on results',
    ]);
    expect(completed.logs.some((entry) => entry.message.includes('Planning phase failed or returned invalid JSON'))).toBe(true);
  });
});
