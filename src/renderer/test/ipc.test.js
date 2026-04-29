// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createIpcHarness() {
  const handleMap = new Map();
  const onMap = new Map();
  const webSend = vi.fn();
  const executeTool = vi.fn();
  const streamChat = vi.fn();
  const bot = {
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    sendMessage: vi.fn(),
  };
  const approvalQueue = {
    events: { on: vi.fn() },
    list: vi.fn(() => []),
    get: vi.fn(),
    markRunning: vi.fn(),
    markApproved: vi.fn(),
    markFailed: vi.fn(),
    deny: vi.fn(),
  };
  const agentRunner = {
    events: { on: vi.fn() },
    listRuns: vi.fn(() => []),
    createRun: vi.fn(),
    cancelRun: vi.fn(),
  };
  const automationRunner = {
    events: { on: vi.fn() },
    listRuns: vi.fn(() => []),
    createRun: vi.fn(),
    cancelRun: vi.fn(),
  };
  const automationScheduler = {
    reload: vi.fn(),
    handleTelegramMessage: vi.fn(),
  };
  const settings = {
    get: vi.fn((key) => {
      if (key === 'lmStudioUrl') return 'http://127.0.0.1:1234';
      return null;
    }),
    load: vi.fn(() => ({})),
    save: vi.fn(),
    set: vi.fn(),
  };

  const source = fs.readFileSync(path.resolve(__dirname, '../../main/ipc.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);
  runModule((id) => {
    if (id === 'electron') {
      return {
        ipcMain: {
          handle: (name, fn) => handleMap.set(name, fn),
          on: (name, fn) => onMap.set(name, fn),
        },
        dialog: {},
        app: { getVersion: () => '0.5.0' },
      };
    }
    if (id === 'fs') return require('fs');
    if (id === 'path') return require('path');
    if (id === './lmstudio') return { getModels: vi.fn(), ping: vi.fn(), streamChat };
    if (id === './telegram') return { getBot: vi.fn(() => bot), validate: vi.fn(), findChatId: vi.fn() };
    if (id === './git') return { getStatus: vi.fn() };
    if (id === './settings') return settings;
    if (id === './db') return { load: vi.fn(), saveAll: vi.fn() };
    if (id === './workspace') return { list: vi.fn(), getActive: vi.fn(), upsert: vi.fn(), setActive: vi.fn() };
    if (id === './tools') return { executeTool };
    if (id === './agentRunner') return agentRunner;
    if (id === './approvalQueue') return approvalQueue;
    if (id === './automationRunner') return automationRunner;
    if (id === './automationScheduler') return automationScheduler;
    if (id === './index') return {};
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/ipc.js'));

  const { setupIPC } = module.exports;
  const win = {
    webContents: { send: webSend },
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    isMaximized: vi.fn(() => false),
    close: vi.fn(),
  };
  setupIPC(win);

  return {
    handleMap,
    onMap,
    webSend,
    executeTool,
    streamChat,
    bot,
    approvalQueue,
    agentRunner,
    automationRunner,
    automationScheduler,
    settings,
    win,
  };
}

describe('main ipc contract', () => {
  let harness;

  beforeEach(() => {
    harness = createIpcHarness();
  });

  it('registers terminal execution through run_command with bypass permissions', async () => {
    harness.executeTool.mockResolvedValue({ ok: true, stdout: 'done' });
    const handler = harness.handleMap.get('terminal:exec');

    const result = await handler({}, { cmd: 'npm test', cwd: 'C:\\repo' });

    expect(harness.executeTool).toHaveBeenCalledWith(
      'run_command',
      { command: 'npm test', cwd: 'C:\\repo' },
      { threadId: 'terminal', bypassPermissions: true },
    );
    expect(result).toEqual({ ok: true, stdout: 'done' });
  });

  it('approves pending tool calls and marks approval state transitions', async () => {
    const approval = {
      id: 'approval-1',
      status: 'pending',
      tool: 'run_command',
      rawArgs: { command: 'npm test' },
      threadId: 'landing',
      agentRunId: 'run-1',
      workspacePath: 'C:\\repo',
    };
    harness.approvalQueue.get.mockReturnValue(approval);
    harness.approvalQueue.markRunning.mockReturnValue({ ...approval, status: 'running' });
    harness.executeTool.mockResolvedValue({ ok: true, stdout: 'done' });
    harness.approvalQueue.markApproved.mockReturnValue({ ...approval, status: 'approved' });

    const handler = harness.handleMap.get('approval:approve');
    const result = await handler({}, 'approval-1');

    expect(harness.approvalQueue.markRunning).toHaveBeenCalledWith('approval-1');
    expect(harness.executeTool).toHaveBeenCalledWith(
      'run_command',
      { command: 'npm test' },
      {
        threadId: 'landing',
        agentRunId: 'run-1',
        workspacePath: 'C:\\repo',
        approvalId: 'approval-1',
      },
    );
    expect(harness.approvalQueue.markApproved).toHaveBeenCalledWith('approval-1', { ok: true, stdout: 'done' });
    expect(result).toEqual({
      ok: true,
      approval: { ...approval, status: 'approved' },
      result: { ok: true, stdout: 'done' },
    });
  });

  it('marks failed approvals when tool execution returns an error result', async () => {
    const approval = {
      id: 'approval-2',
      status: 'pending',
      tool: 'write_file',
      args: { path: 'file.txt', content: 'x' },
    };
    harness.approvalQueue.get.mockReturnValue(approval);
    harness.executeTool.mockResolvedValue({ error: 'permission denied' });
    harness.approvalQueue.markFailed.mockReturnValue({ ...approval, status: 'failed' });

    const handler = harness.handleMap.get('approval:approve');
    const result = await handler({}, 'approval-2');

    expect(harness.approvalQueue.markFailed).toHaveBeenCalledWith('approval-2', 'permission denied');
    expect(result).toEqual({
      ok: false,
      approval: { ...approval, status: 'failed' },
      result: { error: 'permission denied' },
    });
  });

  it('streams chat events back to the renderer in order', async () => {
    harness.streamChat.mockImplementation(async function* () {
      yield { type: 'text', content: 'hello' };
      yield { type: 'tool_call', id: '1', name: 'run_command', args: { command: 'npm test' } };
      yield { type: 'tool_result', id: '1', name: 'run_command', result: { ok: true } };
      yield { type: 'resume' };
    });

    const listener = harness.onMap.get('chat:send');
    await listener({}, {
      messages: [{ role: 'user', content: 'hi' }],
      threadId: 'thread-1',
      model: 'gpt-4o',
      thinking: true,
    });

    expect(harness.streamChat).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hi' }],
      'thread-1',
      'gpt-4o',
      true,
      'http://127.0.0.1:1234',
    );
    expect(harness.webSend.mock.calls).toEqual([
      ['chat:chunk', { chunk: 'hello', threadId: 'thread-1' }],
      ['chat:tool_call', { id: '1', name: 'run_command', args: { command: 'npm test' }, threadId: 'thread-1' }],
      ['chat:tool_result', { id: '1', name: 'run_command', result: { ok: true }, threadId: 'thread-1' }],
      ['chat:resume', { threadId: 'thread-1' }],
      ['chat:done', { threadId: 'thread-1' }],
    ]);
  });

  it('forwards chat stream errors back to the renderer', async () => {
    harness.streamChat.mockImplementation(async function* () {
      throw new Error('LM Studio offline');
    });

    const listener = harness.onMap.get('chat:send');
    await listener({}, {
      messages: [],
      threadId: 'thread-err',
      model: 'gpt-4o',
      thinking: false,
    });

    expect(harness.webSend).toHaveBeenCalledWith('chat:error', {
      error: 'LM Studio offline',
      threadId: 'thread-err',
    });
  });

  it('creates automation runs through the dedicated automation runner', async () => {
    harness.automationRunner.createRun.mockReturnValue({ id: 'auto-run-1', status: 'queued' });
    const handler = harness.handleMap.get('automation:createRun');

    const result = await handler({}, {
      sourceId: 'auto-1',
      name: 'Deploy on merge',
      trigger: { type: 'repository', detail: 'on merge to main' },
      actions: [{ id: 'a1', type: 'command', label: 'Run tests', target: 'npm test' }],
    });

    expect(harness.automationRunner.createRun).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: 'auto-1',
      name: 'Deploy on merge',
    }));
    expect(result).toEqual({ ok: true, run: { id: 'auto-run-1', status: 'queued' } });
  });

  it('reloads the automation scheduler when automations are saved', async () => {
    const handler = harness.handleMap.get('db:saveAll');
    await handler({}, 'automations', [{ id: 'auto-1' }]);
    expect(harness.automationScheduler.reload).toHaveBeenCalled();
  });

  it('routes manual file operations through the shared tool layer', async () => {
    harness.executeTool.mockResolvedValueOnce({ entries: [{ name: 'src', isDir: true, path: 'C:\\repo\\src', ext: null }] });
    harness.executeTool.mockResolvedValueOnce({ content: 'hello world' });
    harness.executeTool.mockResolvedValueOnce({ ok: true, path: 'C:\\repo\\notes.txt' });
    harness.executeTool.mockResolvedValueOnce({ ok: true, oldPath: 'C:\\repo\\old.txt', newPath: 'C:\\repo\\new.txt' });
    harness.executeTool.mockResolvedValueOnce({ ok: true, path: 'C:\\repo\\old.txt' });
    harness.executeTool.mockResolvedValueOnce({ ok: true, path: 'C:\\repo\\folder' });

    expect(await harness.handleMap.get('fs:list')({}, 'C:\\repo')).toEqual([{ name: 'src', isDir: true, path: 'C:\\repo\\src', ext: null }]);
    expect(await harness.handleMap.get('fs:read')({}, 'C:\\repo\\readme.txt')).toEqual({ content: 'hello world', error: null });
    expect(await harness.handleMap.get('fs:write')({}, { filePath: 'C:\\repo\\notes.txt', content: 'x' })).toEqual({ ok: true, path: 'C:\\repo\\notes.txt' });
    expect(await harness.handleMap.get('fs:rename')({}, { oldPath: 'C:\\repo\\old.txt', newPath: 'C:\\repo\\new.txt' })).toEqual({ ok: true, oldPath: 'C:\\repo\\old.txt', newPath: 'C:\\repo\\new.txt' });
    expect(await harness.handleMap.get('fs:delete')({}, 'C:\\repo\\old.txt')).toEqual({ ok: true, path: 'C:\\repo\\old.txt' });
    expect(await harness.handleMap.get('fs:mkdir')({}, 'C:\\repo\\folder')).toEqual({ ok: true, path: 'C:\\repo\\folder' });

    expect(harness.executeTool.mock.calls).toEqual([
      ['list_directory', { path: 'C:\\repo' }, { threadId: 'manual-fs:list', skipApproval: true }],
      ['read_file', { path: 'C:\\repo\\readme.txt' }, { threadId: 'manual-fs:read', skipApproval: true }],
      ['write_file', { path: 'C:\\repo\\notes.txt', content: 'x' }, { threadId: 'manual-save', skipApproval: true }],
      ['rename_path', { oldPath: 'C:\\repo\\old.txt', newPath: 'C:\\repo\\new.txt' }, { threadId: 'manual-fs:rename', skipApproval: true }],
      ['delete_path', { path: 'C:\\repo\\old.txt' }, { threadId: 'manual-fs:delete', skipApproval: true }],
      ['make_directory', { path: 'C:\\repo\\folder' }, { threadId: 'manual-fs:mkdir', skipApproval: true }],
    ]);
  });

  it('forwards polled telegram messages to both the scheduler and renderer', async () => {
    const handler = harness.handleMap.get('telegram:startPolling');

    const result = await handler({}, { token: 'telegram-token' });
    expect(result).toEqual({ ok: true });
    expect(harness.bot.startPolling).toHaveBeenCalledTimes(1);

    const onMessage = harness.bot.startPolling.mock.calls[0][0];
    const message = {
      chat: { id: 42 },
      from: { first_name: 'Nat' },
      text: 'deploy status please',
      date: 1714400000,
      message_id: 123,
    };
    onMessage(message);

    expect(harness.automationScheduler.handleTelegramMessage).toHaveBeenCalledWith(message);
    expect(harness.webSend).toHaveBeenCalledWith('telegram:message', {
      chatId: 42,
      from: 'Nat',
      text: 'deploy status please',
      date: 1714400000,
    });
  });
});
