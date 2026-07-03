// @vitest-environment node
//
// Phase 5 multi-agent orchestration tests.
// Verifies:
//   O-1  scratchpad set/get/list/delete + size limits + drop
//   O-2  scratchpad isolation between parent runs
//   O-3  agentRunner.waitForRuns (plural) resolves when all runs complete
//   O-4  executeTool routes spawn_agents (fan-out) and returns gathered results
//   O-5  executeTool routes scratchpad_set/get/list to the scratchpad module
//   O-6  scratchpad requires a parentRunId (fails gracefully for top-level calls)

import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// ─── O-1 + O-2: scratchpad module ─────────────────────────────────────────
function loadScratchpadModule() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/scratchpad.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);
  runModule((id) => {
    if (id === 'events') return require('events');
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/scratchpad.js'));
  return module.exports;
}

describe('O-1: scratchpad set/get/list/delete', () => {
  let scratchpad;
  beforeEach(() => {
    scratchpad = loadScratchpadModule();
  });

  it('sets and gets a value with metadata', () => {
    const result = scratchpad.set('run-1', 'claim:task-1', { file: 'auth.ts' }, 'agent-A');
    expect(result.ok).toBe(true);
    expect(result.key).toBe('claim:task-1');
    expect(result.writtenBy).toBe('agent-A');
    expect(result.writtenAt).toBeTruthy();

    const read = scratchpad.get('run-1', 'claim:task-1');
    expect(read.ok).toBe(true);
    expect(read.value).toEqual({ file: 'auth.ts' });
    expect(read.writtenBy).toBe('agent-A');
  });

  it('returns an error when getting a missing key', () => {
    const read = scratchpad.get('run-1', 'nonexistent');
    expect(read.ok).toBe(false);
    expect(read.error).toMatch(/not set/i);
  });

  it('lists all keys with metadata', () => {
    scratchpad.set('run-2', 'a', 1, 'agent-A');
    scratchpad.set('run-2', 'b', 2, 'agent-B');
    const list = scratchpad.list('run-2');
    expect(list.ok).toBe(true);
    expect(list.keys).toHaveLength(2);
    expect(list.keys.map(k => k.key).sort()).toEqual(['a', 'b']);
    expect(list.keys.find(k => k.key === 'b').writtenBy).toBe('agent-B');
  });

  it('deletes a key', () => {
    scratchpad.set('run-3', 'temp', 'value', 'agent-A');
    expect(scratchpad.get('run-3', 'temp').ok).toBe(true);
    const del = scratchpad.delete('run-3', 'temp');
    expect(del.ok).toBe(true);
    expect(scratchpad.get('run-3', 'temp').ok).toBe(false);
  });

  it('enforces the max-keys-per-run limit', () => {
    for (let i = 0; i < scratchpad.MAX_KEYS_PER_RUN; i++) {
      scratchpad.set('run-limit', `key-${i}`, i, 'agent');
    }
    const over = scratchpad.set('run-limit', 'one-too-many', 'value', 'agent');
    expect(over.ok).toBe(false);
    expect(over.error).toMatch(/full/i);
  });

  it('rejects oversized values', () => {
    const big = 'x'.repeat(scratchpad.MAX_VALUE_CHARS + 1);
    const result = scratchpad.set('run-big', 'big', big, 'agent');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too large/i);
  });

  it('rejects non-JSON-serializable values', () => {
    const circular = { self: null };
    circular.self = circular;
    const result = scratchpad.set('run-circ', 'circ', circular, 'agent');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not JSON-serializable/i);
  });

  it('last-write-wins on the same key', () => {
    scratchpad.set('run-lww', 'k', 'first', 'A');
    scratchpad.set('run-lww', 'k', 'second', 'B');
    const read = scratchpad.get('run-lww', 'k');
    expect(read.value).toBe('second');
    expect(read.writtenBy).toBe('B');
  });
});

describe('O-2: scratchpad isolation between parent runs', () => {
  it('keys set on one run are not visible to another', () => {
    const scratchpad = loadScratchpadModule();
    scratchpad.set('run-A', 'shared-key', 'from-A', 'agent-A');
    scratchpad.set('run-B', 'shared-key', 'from-B', 'agent-B');

    expect(scratchpad.get('run-A', 'shared-key').value).toBe('from-A');
    expect(scratchpad.get('run-B', 'shared-key').value).toBe('from-B');
  });

  it('drop() clears only the specified run', () => {
    const scratchpad = loadScratchpadModule();
    scratchpad.set('run-X', 'k', 1, 'a');
    scratchpad.set('run-Y', 'k', 2, 'b');
    scratchpad.drop('run-X');

    expect(scratchpad.size('run-X')).toBe(0);
    expect(scratchpad.size('run-Y')).toBe(1);
    expect(scratchpad.get('run-Y', 'k').value).toBe(2);
  });
});

describe('O-6: scratchpad requires a parentRunId', () => {
  it('set returns an error when parentRunId is null', () => {
    const scratchpad = loadScratchpadModule();
    const result = scratchpad.set(null, 'k', 'v', 'agent');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No parentRunId/i);
  });

  it('get returns an error when parentRunId is null', () => {
    const scratchpad = loadScratchpadModule();
    const result = scratchpad.get(null, 'k');
    expect(result.ok).toBe(false);
  });

  it('list returns an error when parentRunId is null', () => {
    const scratchpad = loadScratchpadModule();
    const result = scratchpad.list(null);
    expect(result.ok).toBe(false);
  });
});

// ─── O-3: agentRunner.waitForRuns ─────────────────────────────────────────
describe('O-3: agentRunner.waitForRuns (plural)', () => {
  function loadAgentRunner({ settingsState, streamChat }) {
    const source = fs.readFileSync(path.resolve(__dirname, '../../main/agentRunner.js'), 'utf8');
    const module = { exports: {} };
    const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);
    runModule((id) => {
      if (id === 'events') return require('events');
      if (id === './settings') return {
        get: (key) => settingsState[key],
        set: (key, value) => { settingsState[key] = value; },
      };
      if (id === './workspace') return { getActive: vi.fn(async () => null) };
      if (id === './lmstudio') return { streamChat, getClient: vi.fn(), getClientForModel: vi.fn() };
      if (id === './scratchpad') return loadScratchpadModule();
      throw new Error(`Unexpected module: ${id}`);
    }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/agentRunner.js'));
    return module.exports;
  }

  it('resolves with an empty array when given no ids', async () => {
    const agentRunner = loadAgentRunner({
      settingsState: { agentRuns: [], model: 'm', lmStudioUrl: 'http://x' },
      streamChat: vi.fn(async function* () { yield { type: 'text', content: 'done' }; }),
    });
    const result = await agentRunner.waitForRuns([]);
    expect(result).toEqual([]);
  });

  it('resolves with all run objects once every run completes', async () => {
    const agentRunner = loadAgentRunner({
      settingsState: { agentRuns: [], model: 'm', lmStudioUrl: 'http://x' },
      streamChat: vi.fn(async function* () { yield { type: 'text', content: 'ok' }; }),
    });

    const run1 = await agentRunner.createRun({ name: 'a', instruction: 'do a' });
    const run2 = await agentRunner.createRun({ name: 'b', instruction: 'do b' });

    // Use fake timers to advance the 250ms schedule delay.
    const { vi: vitestVi } = await import('vitest');
    vitestVi.useFakeTimers();
    await vitestVi.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    vitestVi.useRealTimers();

    const completed = await agentRunner.waitForRuns([run1.id, run2.id]);
    expect(completed).toHaveLength(2);
    expect(completed.every(r => r.status === 'done' || r.status === 'error')).toBe(true);
    expect(completed.map(r => r.id).sort()).toEqual([run1.id, run2.id].sort());
  });
});

// ─── O-4 + O-5: executeTool routing ──────────────────────────────────────
describe('O-4 + O-5: executeTool routes orchestration tools', () => {
  function loadToolsModule({ agentRunner, scratchpad }) {
    const source = fs.readFileSync(path.resolve(__dirname, '../../main/tools.js'), 'utf8');
    const module = { exports: {} };
    const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', 'fetch', source);
    runModule((id) => {
      if (id === 'electron') return { app: { getPath: () => '/tmp' } };
      if (id === 'child_process') return { exec: vi.fn() };
      if (id === 'fs') return require('fs');
      if (id === 'fs/promises') return require('fs/promises');
      if (id === 'path') return require('path');
      if (id === './workspace') return { getActivePathSync: () => null, isGeneratedDir: () => false };
      if (id === './settings') return { get: () => ({ approvalMode: 'auto', spawnAgents: true }) };
      if (id === './approvalQueue') return { create: vi.fn() };
      if (id === './agentRunner') return agentRunner;
      if (id === './scratchpad') return scratchpad;
      if (id === './mcpClient') return { callTool: vi.fn(), isMcpTool: vi.fn(() => false) };
      throw new Error(`Unexpected module: ${id}`);
    }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/tools.js'), () => Promise.resolve({ json: async () => ({}) }));
    return module.exports;
  }

  it('spawn_agents fans out, waits, and gathers results', async () => {
    const fakeRuns = [
      { id: 'r1', name: 'task1', status: 'done', output: { text: 'result 1' } },
      { id: 'r2', name: 'task2', status: 'done', output: { text: 'result 2' } },
    ];
    let created = 0;
    const agentRunner = {
      createRun: vi.fn(async (spec) => ({ id: fakeRuns[created++]?.id || 'r3', ...spec })),
      waitForRuns: vi.fn(async (ids) => ids.map(id => fakeRuns.find(r => r.id === id) || { id, status: 'done', output: { text: 'x' } })),
    };
    const tools = loadToolsModule({ agentRunner, scratchpad: loadScratchpadModule() });

    const result = await tools.executeTool('spawn_agents', {
      agents: [
        { name: 'task1', instruction: 'do 1' },
        { name: 'task2', instruction: 'do 2' },
      ],
    }, { threadId: 'parent-thread', agentRunId: 'parent-run' });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('gathered');
    expect(result.count).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].output).toBe('result 1');
    expect(result.results[1].output).toBe('result 2');
    expect(result.message).toBe('2/2 sub-agents completed successfully.');
    expect(agentRunner.createRun).toHaveBeenCalledTimes(2);
    // Both sub-agents should be created with the parent's run id.
    expect(agentRunner.createRun).toHaveBeenNthCalledWith(1, expect.objectContaining({ parentRunId: 'parent-run' }));
  });

  it('spawn_agents caps at 5 sub-agents', async () => {
    const agentRunner = {
      createRun: vi.fn(async (spec) => ({ id: `r-${spec.name}`, ...spec })),
      waitForRuns: vi.fn(async (ids) => ids.map(id => ({ id, status: 'done', output: { text: 'done' }, name: id }))),
    };
    const tools = loadToolsModule({ agentRunner, scratchpad: loadScratchpadModule() });

    const result = await tools.executeTool('spawn_agents', {
      agents: Array.from({ length: 8 }, (_, i) => ({ name: `t${i}`, instruction: `do ${i}` })),
    }, { threadId: 't', agentRunId: 'p' });

    expect(result.count).toBe(5);
    expect(agentRunner.createRun).toHaveBeenCalledTimes(5);
  });

  it('scratchpad_set routes to the scratchpad module with the parentRunId', async () => {
    const scratchpad = {
      set: vi.fn(() => ({ ok: true, key: 'k', writtenBy: 'parent', writtenAt: 'now' })),
      get: vi.fn(),
      list: vi.fn(),
    };
    const tools = loadToolsModule({
      agentRunner: { createRun: vi.fn(), waitForRuns: vi.fn() },
      scratchpad,
    });

    await tools.executeTool('scratchpad_set', { key: 'claim:file', value: 'auth.ts' }, { threadId: 't', agentRunId: 'parent-run' });
    expect(scratchpad.set).toHaveBeenCalledWith('parent-run', 'claim:file', 'auth.ts', 'parent-run');
  });

  it('scratchpad_get routes to the scratchpad module', async () => {
    const scratchpad = {
      set: vi.fn(),
      get: vi.fn(() => ({ ok: true, key: 'k', value: 'v', writtenBy: 'a', writtenAt: 'now' })),
      list: vi.fn(),
    };
    const tools = loadToolsModule({
      agentRunner: { createRun: vi.fn(), waitForRuns: vi.fn() },
      scratchpad,
    });

    const result = await tools.executeTool('scratchpad_get', { key: 'k' }, { threadId: 't', agentRunId: 'parent-run' });
    expect(scratchpad.get).toHaveBeenCalledWith('parent-run', 'k');
    expect(result.ok).toBe(true);
    expect(result.value).toBe('v');
  });

  it('scratchpad_list routes to the scratchpad module', async () => {
    const scratchpad = {
      set: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => ({ ok: true, keys: [{ key: 'a', writtenBy: 'x', writtenAt: 'now' }] })),
    };
    const tools = loadToolsModule({
      agentRunner: { createRun: vi.fn(), waitForRuns: vi.fn() },
      scratchpad,
    });

    const result = await tools.executeTool('scratchpad_list', {}, { threadId: 't', agentRunId: 'parent-run' });
    expect(scratchpad.list).toHaveBeenCalledWith('parent-run');
    expect(result.keys).toHaveLength(1);
  });
});
