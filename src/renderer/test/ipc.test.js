// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createIpcHarness() {
  const handleMap = new Map();
  const onMap = new Map();
  const webSend = vi.fn();
  const executeTool = vi.fn();
  const prepareStagedWrite = vi.fn();
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
    markStaged: vi.fn(),
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
  const threadStore = {
    list: vi.fn(() => []),
    upsert: vi.fn((item) => item),
    remove: vi.fn(() => []),
    saveAll: vi.fn((items) => items),
  };
  const activityStore = {
    listNotifications: vi.fn(() => []),
    upsertNotification: vi.fn((item) => item),
    dismissNotification: vi.fn(() => []),
    markAllNotificationsRead: vi.fn(() => []),
    saveNotifications: vi.fn((items) => items),
    listEvents: vi.fn(() => []),
    upsertEvent: vi.fn((item) => item),
    saveEvents: vi.fn((items) => items),
  };
  const telegramStore = {
    listMessages: vi.fn(() => []),
    upsertMessage: vi.fn((item) => item),
    removeMessage: vi.fn(() => []),
    saveMessages: vi.fn((items) => items),
  };
  const diagnostics = {
    readRecentDiagnostics: vi.fn(() => []),
  };
  const agentConfigs = {
    list: vi.fn(() => []),
    upsert: vi.fn((item) => item),
    remove: vi.fn(() => []),
    saveAll: vi.fn((items) => items),
  };
  const automationConfigs = {
    list: vi.fn(() => []),
    upsert: vi.fn((item) => item),
    remove: vi.fn(() => []),
    saveAll: vi.fn((items) => items),
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
    if (id === './threadStore') return threadStore;
    if (id === './activityStore') return activityStore;
    if (id === './telegramStore') return telegramStore;
    if (id === './diagnostics') return diagnostics;
    if (id === './agentConfigs') return agentConfigs;
    if (id === './automationConfigs') return automationConfigs;
    if (id === './tools') return { executeTool, prepareStagedWrite };
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
    prepareStagedWrite,
    streamChat,
    bot,
    approvalQueue,
    agentRunner,
    automationRunner,
    automationScheduler,
    threadStore,
    activityStore,
    telegramStore,
    diagnostics,
    agentConfigs,
    automationConfigs,
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
      tool: 'run_command',
      args: { command: 'npm test' },
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

  it('stages write approvals for review instead of executing the write immediately', async () => {
    const approval = {
      id: 'approval-write-1',
      status: 'pending',
      tool: 'write_file',
      rawArgs: { path: 'src\\file.js', content: 'const value = 2;' },
      threadId: 'thread-1',
      agentRunId: 'run-1',
      workspacePath: 'C:\\repo',
    };
    const stagedResult = {
      ok: true,
      staged: true,
      path: 'C:\\repo\\src\\file.js',
      existed: true,
      originalContent: 'const value = 1;',
    };
    harness.approvalQueue.get.mockReturnValue(approval);
    harness.approvalQueue.markRunning.mockReturnValue({ ...approval, status: 'running' });
    harness.prepareStagedWrite.mockReturnValue(stagedResult);
    harness.approvalQueue.markStaged.mockReturnValue({ ...approval, status: 'staged', result: stagedResult });

    const handler = harness.handleMap.get('approval:approve');
    const result = await handler({}, 'approval-write-1');

    expect(harness.prepareStagedWrite).toHaveBeenCalledWith(
      { path: 'src\\file.js', content: 'const value = 2;' },
      {
        threadId: 'thread-1',
        agentRunId: 'run-1',
        workspacePath: 'C:\\repo',
      },
    );
    expect(harness.executeTool).not.toHaveBeenCalled();
    expect(harness.approvalQueue.markStaged).toHaveBeenCalledWith('approval-write-1', stagedResult);
    expect(result).toEqual({
      ok: true,
      approval: { ...approval, status: 'staged', result: stagedResult },
      result: stagedResult,
    });
  });

  it('marks staged write approvals as approved after the reviewed save is applied', async () => {
    const approval = {
      id: 'approval-write-2',
      status: 'staged',
      tool: 'write_file',
      rawArgs: { path: 'src\\file.js', content: 'const value = 2;' },
      result: {
        staged: true,
        path: 'C:\\repo\\src\\file.js',
        originalContent: 'const value = 1;',
      },
    };
    harness.approvalQueue.get.mockReturnValue(approval);
    harness.approvalQueue.markApproved.mockReturnValue({
      ...approval,
      status: 'approved',
      result: { ...approval.result, ok: true, applied: true },
    });

    const handler = harness.handleMap.get('approval:applyStaged');
    const result = await handler({}, { id: 'approval-write-2', path: 'C:\\repo\\src\\file.js' });

    expect(harness.approvalQueue.markApproved).toHaveBeenCalledWith(
      'approval-write-2',
      expect.objectContaining({
        staged: true,
        ok: true,
        applied: true,
        path: 'C:\\repo\\src\\file.js',
      }),
    );
    expect(result.ok).toBe(true);
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
      { ctrl: { cancelled: false } },
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

  it('loads and saves config records through explicit config handlers', async () => {
    harness.agentConfigs.list.mockReturnValue([{ id: 'agent-1' }]);
    harness.agentConfigs.upsert.mockReturnValue({ id: 'agent-2' });
    harness.agentConfigs.remove.mockReturnValue([{ id: 'agent-2' }]);
    harness.agentConfigs.saveAll.mockReturnValue([{ id: 'agent-1' }, { id: 'agent-2' }]);
    harness.automationConfigs.list.mockReturnValue([{ id: 'auto-1' }]);
    harness.automationConfigs.upsert.mockReturnValue({ id: 'auto-2' });
    harness.automationConfigs.remove.mockReturnValue([{ id: 'auto-2' }]);
    harness.automationConfigs.saveAll.mockReturnValue([{ id: 'auto-1' }, { id: 'auto-2' }]);

    expect(await harness.handleMap.get('agentConfig:list')({})).toEqual([{ id: 'agent-1' }]);
    expect(await harness.handleMap.get('agentConfig:upsert')({}, { id: 'agent-2' })).toEqual({
      ok: true,
      item: { id: 'agent-2' },
    });
    expect(await harness.handleMap.get('agentConfig:delete')({}, 'agent-1')).toEqual({
      ok: true,
      items: [{ id: 'agent-2' }],
    });
    expect(await harness.handleMap.get('agentConfig:saveAll')({}, [{ id: 'agent-1' }, { id: 'agent-2' }])).toEqual({
      ok: true,
      items: [{ id: 'agent-1' }, { id: 'agent-2' }],
    });
    expect(await harness.handleMap.get('automationConfig:list')({})).toEqual([{ id: 'auto-1' }]);
    expect(await harness.handleMap.get('automationConfig:upsert')({}, { id: 'auto-2' })).toEqual({
      ok: true,
      item: { id: 'auto-2' },
    });
    expect(await harness.handleMap.get('automationConfig:delete')({}, 'auto-1')).toEqual({
      ok: true,
      items: [{ id: 'auto-2' }],
    });
    expect(await harness.handleMap.get('automationConfig:saveAll')({}, [{ id: 'auto-1' }, { id: 'auto-2' }])).toEqual({
      ok: true,
      items: [{ id: 'auto-1' }, { id: 'auto-2' }],
    });
    expect(harness.automationScheduler.reload).toHaveBeenCalled();
  });

  it('loads and mutates thread, activity, and telegram records through explicit store handlers', async () => {
    harness.threadStore.list.mockReturnValue([{ id: 'thread-1' }]);
    harness.threadStore.upsert.mockReturnValue({ id: 'thread-2' });
    harness.threadStore.remove.mockReturnValue([{ id: 'thread-2' }]);
    harness.threadStore.saveAll.mockReturnValue([{ id: 'thread-1' }, { id: 'thread-2' }]);
    harness.activityStore.listNotifications.mockReturnValue([{ id: 'notif-1' }]);
    harness.activityStore.upsertNotification.mockReturnValue({ id: 'notif-1', read: true });
    harness.activityStore.dismissNotification.mockReturnValue([]);
    harness.activityStore.markAllNotificationsRead.mockReturnValue([{ id: 'notif-1', read: true }]);
    harness.activityStore.saveNotifications.mockReturnValue([{ id: 'notif-1', read: true }]);
    harness.activityStore.listEvents.mockReturnValue([{ id: 'event-1' }]);
    harness.activityStore.upsertEvent.mockReturnValue({ id: 'event-2' });
    harness.activityStore.saveEvents.mockReturnValue([{ id: 'event-1' }, { id: 'event-2' }]);
    harness.telegramStore.listMessages.mockReturnValue([{ id: 'msg-1' }]);
    harness.telegramStore.upsertMessage.mockReturnValue({ id: 'msg-2' });
    harness.telegramStore.removeMessage.mockReturnValue([{ id: 'msg-2' }]);
    harness.telegramStore.saveMessages.mockReturnValue([{ id: 'msg-1' }, { id: 'msg-2' }]);

    expect(await harness.handleMap.get('thread:list')({})).toEqual([{ id: 'thread-1' }]);
    expect(await harness.handleMap.get('thread:upsert')({}, { id: 'thread-2' })).toEqual({
      ok: true,
      item: { id: 'thread-2' },
    });
    expect(await harness.handleMap.get('thread:delete')({}, 'thread-1')).toEqual({
      ok: true,
      items: [{ id: 'thread-2' }],
    });
    expect(await harness.handleMap.get('thread:saveAll')({}, [{ id: 'thread-1' }, { id: 'thread-2' }])).toEqual({
      ok: true,
      items: [{ id: 'thread-1' }, { id: 'thread-2' }],
    });
    expect(await harness.handleMap.get('activity:listNotifications')({})).toEqual([{ id: 'notif-1' }]);
    expect(await harness.handleMap.get('activity:upsertNotification')({}, { id: 'notif-1', read: true })).toEqual({
      ok: true,
      item: { id: 'notif-1', read: true },
    });
    expect(await harness.handleMap.get('activity:dismissNotification')({}, 'notif-1')).toEqual({
      ok: true,
      items: [],
    });
    expect(await harness.handleMap.get('activity:markAllNotificationsRead')({}, undefined)).toEqual({
      ok: true,
      items: [{ id: 'notif-1', read: true }],
    });
    expect(await harness.handleMap.get('activity:saveNotifications')({}, [{ id: 'notif-1', read: true }])).toEqual({
      ok: true,
      items: [{ id: 'notif-1', read: true }],
    });
    expect(await harness.handleMap.get('activity:listEvents')({})).toEqual([{ id: 'event-1' }]);
    expect(await harness.handleMap.get('activity:upsertEvent')({}, { id: 'event-2' })).toEqual({
      ok: true,
      item: { id: 'event-2' },
    });
    expect(await harness.handleMap.get('activity:saveEvents')({}, [{ id: 'event-1' }, { id: 'event-2' }])).toEqual({
      ok: true,
      items: [{ id: 'event-1' }, { id: 'event-2' }],
    });
    expect(await harness.handleMap.get('telegramState:listMessages')({})).toEqual([{ id: 'msg-1' }]);
    expect(await harness.handleMap.get('telegramState:upsertMessage')({}, { id: 'msg-2' })).toEqual({
      ok: true,
      item: { id: 'msg-2' },
    });
    expect(await harness.handleMap.get('telegramState:deleteMessage')({}, 'msg-1')).toEqual({
      ok: true,
      items: [{ id: 'msg-2' }],
    });
    expect(await harness.handleMap.get('telegramState:saveMessages')({}, [{ id: 'msg-1' }, { id: 'msg-2' }])).toEqual({
      ok: true,
      items: [{ id: 'msg-1' }, { id: 'msg-2' }],
    });
  });

  it('loads recent runtime diagnostics through the diagnostics service', async () => {
    harness.diagnostics.readRecentDiagnostics.mockReturnValue([
      { ts: '2026-04-29T12:00:00.000Z', type: 'app:ready', level: 'info', detail: { packaged: false } },
    ]);

    expect(await harness.handleMap.get('diagnostics:list')({}, 25)).toEqual([
      { ts: '2026-04-29T12:00:00.000Z', type: 'app:ready', level: 'info', detail: { packaged: false } },
    ]);
    expect(harness.diagnostics.readRecentDiagnostics).toHaveBeenCalledWith(25);
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
