// @vitest-environment node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function loadToolsModule({ appPath, workspaceState, settingsState, approvalQueue, agentRunner }) {
  const execMock = vi.fn((command, options, cb) => cb(null, `stdout:${command}`, ''));
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/tools.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', 'fetch', source);

  runModule((id) => {
    if (id === 'electron') {
      return { app: { getPath: () => appPath } };
    }
    if (id === 'child_process') {
      return { exec: execMock };
    }
    if (id === 'fs') return require('fs');
    if (id === 'path') return require('path');
    if (id === './workspace') {
      return {
        getActive: () => workspaceState.active,
        getRootFallback: (cwd) => workspaceState.active?.path || cwd || process.cwd(),
        isGeneratedDir: (name) => new Set(workspaceState.ignored || []).has(name),
      };
    }
    if (id === './settings') {
      return {
        get: (key) => settingsState[key],
      };
    }
    if (id === './approvalQueue') return approvalQueue;
    if (id === './agentRunner') return agentRunner;
    if (id === './telegram') {
      return {
        getBot: () => ({ sendMessage: vi.fn(async () => ({ ok: true })) }),
      };
    }
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/tools.js'), async () => ({
    json: async () => ({ AbstractText: 'result text' }),
  }));

  return { tools: module.exports, execMock };
}

describe('tools', () => {
  let tempRoot;
  let repoRoot;
  let outsideRoot;
  let appPath;
  let workspaceState;
  let settingsState;
  let approvalQueue;
  let agentRunner;
  let tools;
  let execMock;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meg-tools-'));
    repoRoot = path.join(tempRoot, 'repo');
    outsideRoot = path.join(tempRoot, 'outside');
    appPath = path.join(tempRoot, 'appdata');
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.mkdirSync(outsideRoot, { recursive: true });
    fs.mkdirSync(appPath, { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'readme.txt'), 'hello world\nsearch me\n', 'utf8');
    fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'src', 'main.js'), 'const token = "abc";\n', 'utf8');

    workspaceState = {
      active: { id: 'ws-1', path: repoRoot },
      ignored: ['node_modules', '.git'],
    };
    settingsState = {
      toolPermissions: {
        readFiles: true,
        writeFiles: true,
        runCommands: true,
        webSearch: true,
        telegram: true,
        spawnAgents: true,
        requireApprovalForWrites: false,
        requireApprovalForCommands: false,
      },
      toolWriteRoots: [repoRoot],
      telegramToken: 'token',
      telegramChatId: 'chat-id',
    };
    approvalQueue = {
      create: vi.fn((input) => ({ id: 'approval-1', ...input })),
    };
    agentRunner = {
      createRun: vi.fn((input) => ({ id: 'agent-1', name: input.name, instruction: input.instruction })),
    };

    const loaded = loadToolsModule({ appPath, workspaceState, settingsState, approvalQueue, agentRunner });
    tools = loaded.tools;
    execMock = loaded.execMock;
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('blocks dangerous commands before execution', () => {
    expect(() => tools.validateCommand('rm -rf .')).toThrow('Command blocked by safety policy');
    expect(execMock).not.toHaveBeenCalled();
  });

  it('creates approvals when command permissions require approval', async () => {
    settingsState.toolPermissions.requireApprovalForCommands = true;
    const result = await tools.executeTool('run_command', { command: 'npm test' }, { threadId: 'thread-1' });

    expect(approvalQueue.create).toHaveBeenCalled();
    expect(result.approvalRequired).toBe(true);
    expect(result.error).toContain('Approval ID: approval-1');
  });

  it('writes inside allowed roots and blocks writes outside them', async () => {
    const okPath = path.join(repoRoot, 'notes.txt');
    const okResult = await tools.executeTool('write_file', { path: okPath, content: 'saved' }, { threadId: 'thread-2' });
    expect(okResult).toEqual({ ok: true, path: okPath });
    expect(fs.readFileSync(okPath, 'utf8')).toBe('saved');

    const blockedPath = path.join(outsideRoot, 'blocked.txt');
    const blocked = await tools.executeTool('write_file', { path: blockedPath, content: 'x' }, { threadId: 'thread-3' });
    expect(blocked.error).toContain('Write blocked outside allowed roots');
  });

  it('renames, creates, and deletes paths inside allowed roots', async () => {
    const originalPath = path.join(repoRoot, 'rename-me.txt');
    const renamedPath = path.join(repoRoot, 'renamed.txt');
    fs.writeFileSync(originalPath, 'rename me', 'utf8');

    const renameResult = await tools.executeTool('rename_path', { oldPath: originalPath, newPath: renamedPath }, { threadId: 'thread-rename' });
    expect(renameResult).toEqual({ ok: true, oldPath: originalPath, newPath: renamedPath });
    expect(fs.existsSync(renamedPath)).toBe(true);

    const dirPath = path.join(repoRoot, 'nested', 'folder');
    const mkdirResult = await tools.executeTool('make_directory', { path: dirPath }, { threadId: 'thread-mkdir' });
    expect(mkdirResult).toEqual({ ok: true, path: dirPath });
    expect(fs.existsSync(dirPath)).toBe(true);

    const deleteResult = await tools.executeTool('delete_path', { path: renamedPath }, { threadId: 'thread-delete' });
    expect(deleteResult).toEqual({ ok: true, path: renamedPath });
    expect(fs.existsSync(renamedPath)).toBe(false);
  });

  it('enforces write permissions for manual file actions while skipping approvals', async () => {
    settingsState.toolPermissions.writeFiles = false;

    const denied = await tools.executeTool('make_directory', { path: path.join(repoRoot, 'blocked-dir') }, {
      threadId: 'thread-manual',
      skipApproval: true,
    });
    expect(denied.error).toContain('File writes are disabled');

    settingsState.toolPermissions.writeFiles = true;
    settingsState.toolPermissions.requireApprovalForWrites = true;
    const allowed = await tools.executeTool('make_directory', { path: path.join(repoRoot, 'manual-dir') }, {
      threadId: 'thread-manual-ok',
      skipApproval: true,
    });
    expect(allowed).toEqual({ ok: true, path: path.join(repoRoot, 'manual-dir') });
    expect(approvalQueue.create).not.toHaveBeenCalled();
  });

  it('reads, lists, and searches files within the active workspace', async () => {
    const readResult = await tools.executeTool('read_file', { path: path.join(repoRoot, 'readme.txt') }, { threadId: 'thread-4' });
    expect(readResult.content).toContain('hello world');

    const listResult = await tools.executeTool('list_directory', { path: repoRoot }, { threadId: 'thread-5' });
    expect(listResult.entries.some((entry) => entry.name === 'src' && entry.type === 'dir')).toBe(true);

    const searchResult = await tools.executeTool('search_files', { path: repoRoot, pattern: 'token' }, { threadId: 'thread-6' });
    expect(searchResult.results).toContain(path.join(repoRoot, 'src', 'main.js'));
  });

  it('returns explicitly narrow metadata for web search results', async () => {
    const result = await tools.executeTool('web_search', { query: 'latest electron release' }, { threadId: 'thread-web' });

    expect(result).toMatchObject({
      mode: 'instant_answer',
      source: 'duckduckgo',
    });
    expect(result.results).toContain('result text');
  });

  it('spawns sub-agents through the agent runner and summarizes successful results', async () => {
    const result = await tools.executeTool('spawn_subagent', {
      name: 'lint-fix',
      instruction: 'Fix lint issues',
    }, { threadId: 'thread-7' });

    expect(agentRunner.createRun).toHaveBeenCalledWith({
      name: 'lint-fix',
      instruction: 'Fix lint issues',
      parentThreadId: 'thread-7',
    });
    expect(result).toMatchObject({
      ok: true,
      status: 'spawned',
      runId: 'agent-1',
      agentName: 'lint-fix',
    });
    expect(tools.summarizeToolResult({ ok: true, path: 'file.txt' }, { path: 'file.txt' })).toEqual({ ok: true, path: 'file.txt' });
  });
});
