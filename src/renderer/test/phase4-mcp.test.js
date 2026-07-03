// @vitest-environment node
//
// Phase 4 MCP client tests.
// Verifies:
//   M-1  listServers / saveServers round-trip with defaults normalization
//   M-2  isMcpTool / parseMcpToolName routing helpers
//   M-3  getToolDefinitions merges connected servers' tools with mcp__ prefix
//   M-4  callTool routes to the right server and returns concatenated text
//   M-5  executeTool routes mcp__-prefixed calls through mcpClient
//   M-6  streamChat merges MCP tools into effectiveTools

import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// ─── Module loader (mirrors the pattern in lmstudio.test.js) ──────────────
function loadMcpModule({ settingsState }) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/mcpClient.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);
  runModule((id) => {
    if (id === 'child_process') return { spawn: vi.fn() };
    if (id === 'events') return require('events');
    if (id === './settings') return {
      get: (key) => settingsState[key],
      set: (key, value) => { settingsState[key] = value; },
    };
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/mcpClient.js'));
  return module.exports;
}

// ─── M-1: listServers / saveServers ──────────────────────────────────────
describe('M-1: MCP server config persistence', () => {
  it('listServers returns an empty array when none configured', () => {
    const mcp = loadMcpModule({ settingsState: {} });
    expect(mcp.listServers()).toEqual([]);
  });

  it('listServers normalizes missing fields with defaults', () => {
    const mcp = loadMcpModule({
      settingsState: {
        mcpServers: [{ name: 'filesystem', command: 'npx foo' }],
      },
    });
    const servers = mcp.listServers();
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      id: 'mcp-1',
      name: 'filesystem',
      command: 'npx foo',
      args: [],
      env: {},
      enabled: true,
      status: 'disconnected',
      tools: [],
      lastError: null,
    });
  });

  it('saveServers persists and listServers reads back', () => {
    const state = {};
    const mcp = loadMcpModule({ settingsState: state });
    mcp.saveServers([{ id: 'ws', name: 'test', command: 'echo', args: ['hi'] }]);
    expect(state.mcpServers).toEqual([{ id: 'ws', name: 'test', command: 'echo', args: ['hi'] }]);
    const read = mcp.listServers();
    expect(read[0].id).toBe('ws');
  });
});

// ─── M-2: routing helpers ─────────────────────────────────────────────────
describe('M-2: MCP tool name routing helpers', () => {
  const mcp = loadMcpModule({ settingsState: {} });

  it('isMcpTool identifies mcp__-prefixed names', () => {
    expect(mcp.isMcpTool('mcp__filesystem__read')).toBe(true);
    expect(mcp.isMcpTool('run_command')).toBe(false);
    expect(mcp.isMcpTool('')).toBe(false);
    expect(mcp.isMcpTool(null)).toBe(false);
  });

  it('parseMcpToolName extracts serverId and toolName', () => {
    expect(mcp.parseMcpToolName('mcp__filesystem__read')).toEqual({
      serverId: 'filesystem',
      toolName: 'read',
    });
    // Tool names with __ in them are handled correctly.
    expect(mcp.parseMcpToolName('mcp__server__nested__tool')).toEqual({
      serverId: 'server',
      toolName: 'nested__tool',
    });
  });

  it('parseMcpToolName returns null for non-MCP names', () => {
    expect(mcp.parseMcpToolName('run_command')).toBeNull();
    expect(mcp.parseMcpToolName('mcp_only_one_part')).toBeNull();
    expect(mcp.parseMcpToolName('')).toBeNull();
  });
});

// ─── M-3 + M-4: tool definitions + call routing ─────────────────────────
// These require an active connection. We test the getToolDefinitions /
// callTool surface by directly injecting a fake connection into the module's
// internal Map — the module exposes this via the `connections` Map being a
// closure-private, so instead we test through the public connect() path
// using a mock child_process.spawn.
describe('M-3/M-4: connected server tool surface', () => {
  function loadMcpWithMockSpawn({ initializeResult, toolsListResult, callResult }) {
    const state = { mcpServers: [] };
    let stdoutHandler = null;
    const fakeProc = {
      stdin: { write: vi.fn((data) => {
        // Simulate the server responding to each request.
        const msg = JSON.parse(data.trim());
        if (msg.method === 'initialize' && initializeResult) {
          setTimeout(() => {
            stdoutHandler(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: initializeResult }) + '\n');
          }, 0);
        } else if (msg.method === 'tools/list' && toolsListResult) {
          setTimeout(() => {
            stdoutHandler(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: toolsListResult }) + '\n');
          }, 0);
        } else if (msg.method === 'tools/call' && callResult) {
          setTimeout(() => {
            stdoutHandler(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: callResult }) + '\n');
          }, 0);
        }
      })},
      stdout: { setEncoding: vi.fn(), on: vi.fn((event, cb) => { if (event === 'data') stdoutHandler = cb; }) },
      stderr: { setEncoding: vi.fn(), on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
    };
    const source = fs.readFileSync(path.resolve(__dirname, '../../main/mcpClient.js'), 'utf8');
    const module = { exports: {} };
    const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);
    runModule((id) => {
      if (id === 'child_process') return { spawn: vi.fn(() => fakeProc) };
      if (id === 'events') return require('events');
      if (id === './settings') return {
        get: (key) => state[key],
        set: (key, value) => { state[key] = value; },
      };
      throw new Error(`Unexpected module: ${id}`);
    }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/mcpClient.js'));
    return { mcp: module.exports, fakeProc };
  }

  it('connect() initializes, fetches tools, and getToolDefinitions prefixes them', async () => {
    const { mcp } = loadMcpWithMockSpawn({
      initializeResult: { protocolVersion: '2024-11-05', capabilities: {} },
      toolsListResult: {
        tools: [
          { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
          { name: 'write_file', description: 'Write a file', inputSchema: { type: 'object' } },
        ],
      },
    });

    await mcp.connect({ id: 'fs', name: 'filesystem', command: 'npx', args: ['server'], env: {}, enabled: true });

    const defs = mcp.getToolDefinitions();
    expect(defs).toHaveLength(2);
    expect(defs[0]).toMatchObject({
      type: 'function',
      function: {
        name: 'mcp__fs__read_file',
        description: '[MCP:filesystem] Read a file',
      },
    });
    expect(defs[0]._mcp).toEqual({ serverId: 'fs', toolName: 'read_file' });
    expect(defs[1].function.name).toBe('mcp__fs__write_file');
  });

  it('callTool routes to the connected server and returns concatenated text', async () => {
    const { mcp } = loadMcpWithMockSpawn({
      initializeResult: { protocolVersion: '2024-11-05', capabilities: {} },
      toolsListResult: { tools: [{ name: 'search', description: 'Search', inputSchema: {} }] },
      callResult: {
        content: [
          { type: 'text', text: 'Result line 1' },
          { type: 'text', text: 'Result line 2' },
          { type: 'image', data: '...' }, // should be ignored
        ],
      },
    });

    await mcp.connect({ id: 'search', name: 'search-srv', command: 'npx', args: [], env: {}, enabled: true });
    const result = await mcp.callTool('mcp__search__search', { query: 'hello' });
    expect(result).toEqual({ ok: true, content: 'Result line 1\nResult line 2' });
  });

  it('callTool throws if server is not connected', async () => {
    const { mcp } = loadMcpWithMockSpawn({
      initializeResult: {},
      toolsListResult: { tools: [] },
    });
    await expect(mcp.callTool('mcp__nonexistent__tool', {})).rejects.toThrow(/not connected/i);
  });

  it('callTool returns error content when server reports isError', async () => {
    const { mcp } = loadMcpWithMockSpawn({
      initializeResult: { protocolVersion: '2024-11-05', capabilities: {} },
      toolsListResult: { tools: [{ name: 'fail', description: '', inputSchema: {} }] },
      callResult: { isError: true, content: [{ type: 'text', text: 'Permission denied' }] },
    });
    await mcp.connect({ id: 'err', name: 'err-srv', command: 'npx', args: [], env: {}, enabled: true });
    const result = await mcp.callTool('mcp__err__fail', {});
    expect(result.ok).toBe(false);
    expect(result.content).toBe('Permission denied');
  });
});

// ─── M-5: executeTool routes mcp__ calls ──────────────────────────────────
describe('M-5: executeTool routes MCP tool calls', () => {
  function loadToolsModule({ mcpCallToolResult }) {
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
      if (id === './settings') return { get: () => null };
      if (id === './approvalQueue') return { create: vi.fn() };
      if (id === './agentRunner') return { createRun: vi.fn(async () => ({ id: 'r' })) };
      if (id === './mcpClient') return {
        callTool: vi.fn(async () => mcpCallToolResult),
        isMcpTool: vi.fn((n) => typeof n === 'string' && n.startsWith('mcp__')),
      };
      throw new Error(`Unexpected module: ${id}`);
    }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/tools.js'), () => Promise.resolve({ json: async () => ({}) }));
    return module.exports;
  }

  it('routes mcp__ tool calls to mcpClient.callTool and returns the content', async () => {
    const tools = loadToolsModule({ mcpCallToolResult: { ok: true, content: '42' } });
    const result = await tools.executeTool('mcp__calc__add', { a: 2, b: 40 });
    expect(result).toEqual({ ok: true, content: '42' });
  });

  it('returns an error result when the MCP tool fails', async () => {
    const tools = loadToolsModule({ mcpCallToolResult: { ok: false, content: 'Division by zero' } });
    const result = await tools.executeTool('mcp__calc__divide', { a: 1, b: 0 });
    expect(result).toEqual({ error: 'Division by zero' });
  });
});

// ─── M-6: streamChat merges MCP tools ─────────────────────────────────────
describe('M-6: streamChat merges MCP tools into effectiveTools', () => {
  function loadLmstudioWithMcp({ mcpTools }) {
    const createMock = vi.fn(async (params) => {
      // Capture the tools array so we can assert on it.
      capturedTools = params.tools;
      const stream = (async function* () {
        yield { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] };
      })();
      return stream;
    });
    let capturedTools = null;
    const OpenAIImpl = vi.fn(function OpenAI(config) {
      return { config, chat: { completions: { create: createMock } } };
    });
    const settings = { get: vi.fn(() => ({})) };
    const source = fs.readFileSync(path.resolve(__dirname, '../../main/lmstudio.js'), 'utf8');
    const module = { exports: {} };
    const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);
    runModule((id) => {
      if (id === 'openai') return OpenAIImpl;
      if (id === './settings') return settings;
      if (id === './tools') return {
        TOOL_DEFINITIONS: [{ type: 'function', function: { name: 'run_command', parameters: {} } }],
        executeTool: vi.fn(),
        summarizeToolResult: vi.fn(),
      };
      if (id === '@anthropic-ai/sdk') return class { constructor() {} messages = { create: vi.fn() }; };
      if (id === './mcpClient') return { getToolDefinitions: vi.fn(() => mcpTools) };
      throw new Error(`Unexpected module: ${id}`);
    }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/lmstudio.js'));
    return { lmstudio: module.exports, getCapturedTools: () => capturedTools };
  }

  it('includes MCP tools alongside built-in tools', async () => {
    const mcpTool = { type: 'function', function: { name: 'mcp__fs__read', parameters: {} }, _mcp: { serverId: 'fs', toolName: 'read' } };
    const { lmstudio, getCapturedTools } = loadLmstudioWithMcp({ mcpTools: [mcpTool] });

    for await (const item of lmstudio.streamChat(
      [{ role: 'user', content: 'hi' }],
      'thread-mcp',
      'qwen/qwen3-8b',
      false,
      'http://127.0.0.1:1234',
      {},
    )) {
      // drain
    }

    const tools = getCapturedTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.function.name)).toEqual(['run_command', 'mcp__fs__read']);
  });

  it('still works when mcpClient is unavailable (falls back to built-in only)', async () => {
    // Simulate the mcpClient require throwing — the try/catch in streamChat
    // should swallow it and proceed with built-in tools only.
    const source = fs.readFileSync(path.resolve(__dirname, '../../main/lmstudio.js'), 'utf8');
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
    const module = { exports: {} };
    const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);
    runModule((id) => {
      if (id === 'openai') return OpenAIImpl;
      if (id === './settings') return { get: vi.fn(() => ({})) };
      if (id === './tools') return {
        TOOL_DEFINITIONS: [{ type: 'function', function: { name: 'run_command', parameters: {} } }],
        executeTool: vi.fn(),
        summarizeToolResult: vi.fn(),
      };
      if (id === '@anthropic-ai/sdk') return class { constructor() {} messages = { create: vi.fn() }; };
      if (id === './mcpClient') throw new Error('module not found');
      throw new Error(`Unexpected module: ${id}`);
    }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/lmstudio.js'));
    const lmstudio = module.exports;

    for await (const item of lmstudio.streamChat(
      [{ role: 'user', content: 'hi' }],
      'thread-no-mcp',
      'qwen/qwen3-8b',
      false,
      'http://127.0.0.1:1234',
      {},
    )) {
      // drain
    }

    expect(capturedTools).toHaveLength(1);
    expect(capturedTools[0].function.name).toBe('run_command');
  });
});
