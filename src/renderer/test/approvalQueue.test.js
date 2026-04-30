// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function loadApprovalQueue(state) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/approvalQueue.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);

  runModule((id) => {
    if (id === 'events') return require('events');
    if (id === './settings') {
      return {
        get: (key) => state[key],
        set: (key, value) => {
          state[key] = value;
        },
      };
    }
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/approvalQueue.js'));

  return module.exports;
}

describe('approvalQueue', () => {
  let queue;
  let state;

  beforeEach(() => {
    state = { toolApprovals: [] };
    queue = loadApprovalQueue(state);
  });

  it('creates sanitized approvals and emits approval:created', () => {
    const changeSpy = vi.fn();
    queue.events.once('change', changeSpy);

    const approval = queue.create({
      tool: 'write_file',
      args: { path: 'file.txt', content: 'hello world', text: 'x'.repeat(300) },
      context: { threadId: 'thread-1', agentRunId: 'agent-1', toolCallId: 'tool-1', workspacePath: 'C:\\repo' },
      reason: 'Need permission',
      result: { staged: true, path: 'C:\\repo\\file.txt' },
    });

    expect(approval.tool).toBe('write_file');
    expect(approval.args).toMatchObject({
      path: 'file.txt',
      content: '[11 chars]',
      text: `${'x'.repeat(240)}...`,
    });
    expect(approval.rawArgs.content).toBe('hello world');
    expect(queue.get(approval.id)).toMatchObject({ id: approval.id, status: 'pending' });
    expect(approval.toolCallId).toBe('tool-1');
    expect(approval.result).toEqual({ staged: true, path: 'C:\\repo\\file.txt' });
    expect(state.toolApprovals).toHaveLength(1);
    expect(changeSpy).toHaveBeenCalledWith({ type: 'approval:created', approval: expect.objectContaining({ id: approval.id }) });
  });

  it('transitions approvals through running, staged, approved, denied, and error states', () => {
    const created = queue.create({
      tool: 'run_command',
      args: { command: 'npm test' },
      context: { threadId: 'thread-2' },
    });

    const running = queue.markRunning(created.id);
    expect(running.status).toBe('running');

    const staged = queue.markStaged(created.id, { staged: true, path: 'C:\\repo\\draft.txt' });
    expect(staged.status).toBe('staged');
    expect(staged.result).toEqual({ staged: true, path: 'C:\\repo\\draft.txt' });

    const approved = queue.markApproved(created.id, { ok: true, stdout: 'done' });
    expect(approved.status).toBe('approved');
    expect(approved.result).toEqual({ ok: true, stdout: 'done' });
    expect(approved.resolvedAt).toBeTruthy();

    const deniedSeed = queue.create({
      tool: 'write_file',
      args: { path: 'a.txt', content: 'abc' },
      context: {},
    });
    const denied = queue.deny(deniedSeed.id);
    expect(denied.status).toBe('denied');
    expect(denied.resolvedAt).toBeTruthy();

    const failedSeed = queue.create({
      tool: 'send_telegram',
      args: { text: 'ping' },
      context: {},
    });
    const failed = queue.markFailed(failedSeed.id, new Error('network down'));
    expect(failed.status).toBe('error');
    expect(failed.error).toBe('network down');
  });
});
