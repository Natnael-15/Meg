// @vitest-environment node
//
// Phase 1 stabilization tests.
// Verifies the four P0 bug fixes:
//   P0-1  completeChat is exported from lmstudio and routes through providers
//   P0-2  streamChat respects the per-agent tool allowlist (allowedToolNames)
//   P0-3  deleteNotification is exposed on the preload bridge
//   P0-4  streamChat aborts in-flight HTTP requests when ctrl.cancelled is set

import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// ─── Module loader (mirrors the pattern in lmstudio.test.js) ───────────────
function loadLmstudioModule({ OpenAIImpl, settings, toolsModule }) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/lmstudio.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);
  runModule((id) => {
    if (id === 'openai') return OpenAIImpl;
    if (id === './settings') return settings;
    if (id === './tools') return toolsModule;
    if (id === '@anthropic-ai/sdk') {
      // Minimal Anthropic SDK stub — only used if a test routes to claude-*
      return class FakeAnthropic {
        constructor() {}
        messages = { create: vi.fn(async () => ({ content: [] })) };
      };
    }
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/lmstudio.js'));
  return module.exports;
}

const SAMPLE_TOOL_DEFINITIONS = [
  { type: 'function', function: { name: 'run_command', parameters: {} } },
  { type: 'function', function: { name: 'read_file', parameters: {} } },
  { type: 'function', function: { name: 'write_file', parameters: {} } },
  { type: 'function', function: { name: 'web_search', parameters: {} } },
  { type: 'function', function: { name: 'send_telegram', parameters: {} } },
  { type: 'function', function: { name: 'spawn_subagent', parameters: {} } },
];

// ─── P0-1: completeChat ────────────────────────────────────────────────────
describe('P0-1: completeChat (non-streaming completion)', () => {
  it('is exported from lmstudio and returns the assistant text via the OpenAI client', async () => {
    const createMock = vi.fn(async () => ({
      choices: [{ message: { content: '  Generated document body  ' } }],
    }));
    const OpenAIImpl = vi.fn(function OpenAI(config) {
      this.config = config;
      return { config, chat: { completions: { create: createMock } } };
    });
    const settings = { get: vi.fn(() => ({})) };
    const lmstudio = loadLmstudioModule({
      OpenAIImpl,
      settings,
      toolsModule: { TOOL_DEFINITIONS: SAMPLE_TOOL_DEFINITIONS, executeTool: vi.fn(), summarizeToolResult: vi.fn() },
    });

    expect(typeof lmstudio.completeChat).toBe('function');

    const result = await lmstudio.completeChat(
      [{ role: 'user', content: 'Write a short doc.' }],
      'qwen/qwen3-8b',
      'http://127.0.0.1:1234',
    );

    expect(result).toBe('Generated document body'); // trimmed
    expect(createMock).toHaveBeenCalledTimes(1);
    const callArg = createMock.mock.calls[0][0];
    expect(callArg.model).toBe('qwen/qwen3-8b');
    expect(callArg.stream).toBeUndefined(); // non-streaming
  });

  it('returns an empty string when the provider returns no content', async () => {
    const createMock = vi.fn(async () => ({ choices: [{ message: {} }] }));
    const OpenAIImpl = vi.fn(function OpenAI(config) {
      return { config, chat: { completions: { create: createMock } } };
    });
    const settings = { get: vi.fn(() => ({})) };
    const lmstudio = loadLmstudioModule({
      OpenAIImpl,
      settings,
      toolsModule: { TOOL_DEFINITIONS: SAMPLE_TOOL_DEFINITIONS, executeTool: vi.fn(), summarizeToolResult: vi.fn() },
    });

    const result = await lmstudio.completeChat([], 'qwen/qwen3-8b');
    expect(result).toBe('');
  });
});

// ─── P0-2: allowedToolNames enforcement ────────────────────────────────────
describe('P0-2: streamChat respects per-agent tool allowlist', () => {
  it('exports TOOL_CATEGORY_MAP with terminal/fs/browser category mappings', () => {
    const OpenAIImpl = vi.fn(function OpenAI() { return {}; });
    const settings = { get: vi.fn(() => ({})) };
    const lmstudio = loadLmstudioModule({
      OpenAIImpl,
      settings,
      toolsModule: { TOOL_DEFINITIONS: SAMPLE_TOOL_DEFINITIONS, executeTool: vi.fn(), summarizeToolResult: vi.fn() },
    });

    expect(lmstudio.TOOL_CATEGORY_MAP).toBeDefined();
    expect(lmstudio.TOOL_CATEGORY_MAP.terminal).toContain('run_command');
    expect(lmstudio.TOOL_CATEGORY_MAP.fs).toEqual(
      expect.arrayContaining(['read_file', 'write_file', 'search_files']),
    );
    expect(lmstudio.TOOL_CATEGORY_MAP.browser).toContain('web_search');
  });

  it('filters the tools sent to the LLM to only allowed tool names', async () => {
    let capturedTools = null;
    const createMock = vi.fn(async (params) => {
      capturedTools = params.tools;
      // Return a plain stop response so streamChat exits after one iteration.
      const stream = (async function* () {
        yield { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] };
      })();
      return stream;
    });
    const OpenAIImpl = vi.fn(function OpenAI(config) {
      return { config, chat: { completions: { create: createMock } } };
    });
    const settings = { get: vi.fn(() => ({})) };
    const lmstudio = loadLmstudioModule({
      OpenAIImpl,
      settings,
      toolsModule: { TOOL_DEFINITIONS: SAMPLE_TOOL_DEFINITIONS, executeTool: vi.fn(), summarizeToolResult: vi.fn() },
    });

    // Agent only allows terminal → only run_command should be visible.
    const allowedToolNames = new Set(['run_command']);
    const items = [];
    for await (const item of lmstudio.streamChat(
      [{ role: 'user', content: 'do something' }],
      'thread-1',
      'qwen/qwen3-8b',
      false,
      'http://127.0.0.1:1234',
      { allowedToolNames },
    )) {
      items.push(item);
    }

    expect(capturedTools).toHaveLength(1);
    expect(capturedTools[0].function.name).toBe('run_command');
  });

  it('sends all tools when no allowlist is provided (backward compat)', async () => {
    let capturedTools = null;
    const createMock = vi.fn(async (params) => {
      capturedTools = params.tools;
      const stream = (async function* () {
        yield { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] };
      })();
      return stream;
    });
    const OpenAIImpl = vi.fn(function OpenAI(config) {
      return { config, chat: { completions: { create: createMock } } };
    });
    const settings = { get: vi.fn(() => ({})) };
    const lmstudio = loadLmstudioModule({
      OpenAIImpl,
      settings,
      toolsModule: { TOOL_DEFINITIONS: SAMPLE_TOOL_DEFINITIONS, executeTool: vi.fn(), summarizeToolResult: vi.fn() },
    });

    for await (const item of lmstudio.streamChat(
      [{ role: 'user', content: 'hi' }],
      'thread-2',
      'qwen/qwen3-8b',
      false,
      'http://127.0.0.1:1234',
      {}, // no allowedToolNames
    )) {
      // drain
    }

    expect(capturedTools).toHaveLength(SAMPLE_TOOL_DEFINITIONS.length);
  });

  it('rejects a disallowed tool call with a clear error message', async () => {
    // The LLM "hallucinates" a web_search call even though only run_command is allowed.
    const createMock = vi.fn(async () => {
      const stream = (async function* () {
        yield {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: 'tc-1',
                function: { name: 'web_search', arguments: '{"query":"weather"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        };
        // Second iteration: respond with text so the loop terminates.
        yield { choices: [{ delta: { content: 'Sorry, cannot search.' }, finish_reason: 'stop' }] };
      })();
      return stream;
    });
    const OpenAIImpl = vi.fn(function OpenAI(config) {
      return { config, chat: { completions: { create: createMock } } };
    });
    const settings = { get: vi.fn(() => ({})) };
    const lmstudio = loadLmstudioModule({
      OpenAIImpl,
      settings,
      toolsModule: {
        TOOL_DEFINITIONS: SAMPLE_TOOL_DEFINITIONS,
        executeTool: vi.fn(), // should never be called for web_search
        summarizeToolResult: vi.fn(),
      },
    });

    const allowedToolNames = new Set(['run_command']);
    const results = [];
    for await (const item of lmstudio.streamChat(
      [{ role: 'user', content: 'search the web' }],
      'thread-3',
      'qwen/qwen3-8b',
      false,
      'http://127.0.0.1:1234',
      { allowedToolNames },
    )) {
      if (item.type === 'tool_result') results.push(item);
    }

    const denied = results.find((r) => r.name === 'web_search');
    expect(denied).toBeDefined();
    expect(denied.result.error).toMatch(/not allowed/i);
  });
});

// ─── P0-3: deleteNotification preload bridge ───────────────────────────────
describe('P0-3: deleteNotification on the preload bridge', () => {
  it('exposes deleteNotification as an alias that invokes activity:dismissNotification', () => {
    const preloadSource = fs.readFileSync(path.resolve(__dirname, '../../preload/index.js'), 'utf8');
    // The preload uses electron's contextBridge + ipcRenderer. We stub both
    // so we can capture the IPC channel name without needing a real Electron runtime.
    const invokeCalls = [];
    const ipcRenderer = {
      invoke: (channel, ...args) => { invokeCalls.push({ channel, args }); return Promise.resolve(true); },
      on: () => {},
      send: () => {},
      removeAllListeners: () => {},
      removeListener: () => {},
    };
    const module = { exports: {} };
    const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', preloadSource);
    runModule((id) => {
      if (id === 'electron') return { contextBridge: { exposeInMainWorld: (_name, api) => { module.exports.api = api; } }, ipcRenderer };
      throw new Error(`Unexpected module: ${id}`);
    }, module, module.exports, path.resolve(__dirname, '../../preload'), path.resolve(__dirname, '../../preload/index.js'));

    expect(typeof module.exports.api.deleteNotification).toBe('function');
    expect(typeof module.exports.api.dismissNotification).toBe('function');

    module.exports.api.deleteNotification('notif-42');

    const call = invokeCalls.find((c) => c.args[0] === 'notif-42');
    expect(call).toBeDefined();
    expect(call.channel).toBe('activity:dismissNotification');
  });
});

// ─── P0-4: AbortController wiring on cancellation ─────────────────────────
describe('P0-4: streamChat aborts in-flight requests when ctrl.cancelled is set', () => {
  it('aborts the AbortController signal when ctrl.cancelled becomes true mid-stream', async () => {
    let capturedSignal = null;
    // The create() call returns a stream that yields one chunk then blocks
    // on a "network read" that is only unblocked by the abort signal firing.
    // This mirrors how a real fetch-backed SSE stream behaves under abort.
    const createMock = vi.fn(async (_params, options) => {
      capturedSignal = options?.signal;
      const stream = (async function* () {
        yield { choices: [{ delta: { content: 'partial' } }] };
        // Simulate a blocking HTTP read that rejects when the abort signal fires.
        await new Promise((resolve, reject) => {
          const onAbort = () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          };
          if (options?.signal) {
            if (options.signal.aborted) { onAbort(); return; }
            options.signal.addEventListener('abort', onAbort, { once: true });
          }
        });
      })();
      return stream;
    });
    const OpenAIImpl = vi.fn(function OpenAI(config) {
      return { config, chat: { completions: { create: createMock } } };
    });
    const settings = { get: vi.fn(() => ({})) };
    const lmstudio = loadLmstudioModule({
      OpenAIImpl,
      settings,
      toolsModule: { TOOL_DEFINITIONS: SAMPLE_TOOL_DEFINITIONS, executeTool: vi.fn(), summarizeToolResult: vi.fn() },
    });

    const ctrl = { cancelled: false };
    const items = [];
    const streamPromise = (async () => {
      for await (const item of lmstudio.streamChat(
        [{ role: 'user', content: 'long running' }],
        'thread-abort',
        'qwen/qwen3-8b',
        false,
        'http://127.0.0.1:1234',
        { ctrl },
      )) {
        items.push(item);
      }
    })();

    // Give the stream a moment to start, then cancel.
    await new Promise((r) => setTimeout(r, 120));
    ctrl.cancelled = true;

    // The cancel watcher (50ms poll) will fire abortCtrl.abort(), which
    // triggers our mock stream's abort listener, which rejects with
    // AbortError, which streamChat catches and breaks on.
    await streamPromise;

    // The key assertion: the stream resolved (didn't hang forever) and the
    // abort signal was actually fired. This proves the cancel watcher wired
    // ctrl.cancelled → abortCtrl.abort() correctly.
    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal.aborted).toBe(true);
  });
});
