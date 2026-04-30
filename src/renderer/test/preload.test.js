// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('preload bridge', () => {
  let send;
  let invoke;
  let on;
  let removeListener;
  let removeAllListeners;
  let exposeInMainWorld;
  let electronAPI;

  beforeEach(() => {
    send = vi.fn();
    invoke = vi.fn();
    on = vi.fn();
    removeListener = vi.fn();
    removeAllListeners = vi.fn();
    exposeInMainWorld = vi.fn();
    const source = fs.readFileSync(path.resolve(__dirname, '../../preload/index.js'), 'utf8');
    const runPreload = new Function('require', source);
    runPreload((id) => {
      if (id === 'electron') {
        return {
          contextBridge: { exposeInMainWorld },
          ipcRenderer: { send, invoke, on, removeListener, removeAllListeners },
        };
      }
      throw new Error(`Unexpected module: ${id}`);
    });
    electronAPI = exposeInMainWorld.mock.calls[0][1];
  });

  it('exposes the electronAPI bridge in the main world', () => {
    expect(exposeInMainWorld).toHaveBeenCalledWith('electronAPI', expect.any(Object));
    expect(electronAPI).toBeTruthy();
  });

  it('routes command-style methods through send/invoke', () => {
    electronAPI.sendChat(['msg'], 'thread-1', 'gpt-4o', true);
    electronAPI.abortChat('thread-1');
    electronAPI.checkForUpdates();
    electronAPI.downloadUpdate();
    electronAPI.installUpdate();
    electronAPI.execCommand('npm test', 'C:\\repo');
    electronAPI.setActiveWorkspace({ id: 'ws-1' });
    electronAPI.refreshWorkspaceMeta('ws-1');
    electronAPI.searchWorkspaceFiles('ws-1', 'app', 50);
    electronAPI.listThreads();
    electronAPI.upsertThread({ id: 'thread-1' });
    electronAPI.deleteThread('thread-1');
    electronAPI.saveThreads([{ id: 'thread-1' }]);
    electronAPI.listNotifications();
    electronAPI.upsertNotification({ id: 'notif-1' });
    electronAPI.dismissNotification('notif-1');
    electronAPI.markAllNotificationsRead();
    electronAPI.saveNotifications([{ id: 'notif-1' }]);
    electronAPI.listEvents();
    electronAPI.upsertEvent({ id: 'event-1' });
    electronAPI.saveEvents([{ id: 'event-1' }]);
    electronAPI.listTelegramMessages();
    electronAPI.upsertTelegramMessage({ id: 'message-1' });
    electronAPI.deleteTelegramMessage('message-1');
    electronAPI.saveTelegramMessages([{ id: 'message-1' }]);
    electronAPI.applyStagedApproval('approval-1', 'C:\\repo\\file.txt');
    electronAPI.listRuntimeDiagnostics(25);
    electronAPI.listAgentConfigs();
    electronAPI.upsertAgentConfig({ id: 'agent-1' });
    electronAPI.deleteAgentConfig('agent-1');
    electronAPI.saveAgentConfigs([{ id: 'agent-1' }]);
    electronAPI.listAutomationConfigs();
    electronAPI.upsertAutomationConfig({ id: 'auto-1' });
    electronAPI.deleteAutomationConfig('auto-1');
    electronAPI.saveAutomationConfigs([{ id: 'auto-1' }]);
    electronAPI.createAutomationRun({ id: 'auto-1' });
    electronAPI.cancelAutomationRun('run-1');
    const stopDiagnostics = electronAPI.onRuntimeDiagnostic(vi.fn());
    stopDiagnostics();

    expect(send).toHaveBeenCalledWith('chat:send', {
      messages: ['msg'],
      threadId: 'thread-1',
      model: 'gpt-4o',
      thinking: true,
    });
    expect(send).toHaveBeenCalledWith('chat:abort', { threadId: 'thread-1' });
    expect(send).toHaveBeenCalledWith('update:check');
    expect(send).toHaveBeenCalledWith('update:download');
    expect(send).toHaveBeenCalledWith('update:install');
    expect(invoke).toHaveBeenCalledWith('terminal:exec', { cmd: 'npm test', cwd: 'C:\\repo' });
    expect(invoke).toHaveBeenCalledWith('workspace:setActive', { id: 'ws-1' });
    expect(invoke).toHaveBeenCalledWith('workspace:refreshMeta', 'ws-1');
    expect(invoke).toHaveBeenCalledWith('workspace:searchFiles', { workspaceId: 'ws-1', query: 'app', limit: 50 });
    expect(invoke).toHaveBeenCalledWith('thread:list');
    expect(invoke).toHaveBeenCalledWith('thread:upsert', { id: 'thread-1' });
    expect(invoke).toHaveBeenCalledWith('thread:delete', 'thread-1');
    expect(invoke).toHaveBeenCalledWith('thread:saveAll', [{ id: 'thread-1' }]);
    expect(invoke).toHaveBeenCalledWith('activity:listNotifications');
    expect(invoke).toHaveBeenCalledWith('activity:upsertNotification', { id: 'notif-1' });
    expect(invoke).toHaveBeenCalledWith('activity:dismissNotification', 'notif-1');
    expect(invoke).toHaveBeenCalledWith('activity:markAllNotificationsRead');
    expect(invoke).toHaveBeenCalledWith('activity:saveNotifications', [{ id: 'notif-1' }]);
    expect(invoke).toHaveBeenCalledWith('activity:listEvents');
    expect(invoke).toHaveBeenCalledWith('activity:upsertEvent', { id: 'event-1' });
    expect(invoke).toHaveBeenCalledWith('activity:saveEvents', [{ id: 'event-1' }]);
    expect(invoke).toHaveBeenCalledWith('telegramState:listMessages');
    expect(invoke).toHaveBeenCalledWith('telegramState:upsertMessage', { id: 'message-1' });
    expect(invoke).toHaveBeenCalledWith('telegramState:deleteMessage', 'message-1');
    expect(invoke).toHaveBeenCalledWith('telegramState:saveMessages', [{ id: 'message-1' }]);
    expect(invoke).toHaveBeenCalledWith('approval:applyStaged', { id: 'approval-1', path: 'C:\\repo\\file.txt' });
    expect(invoke).toHaveBeenCalledWith('diagnostics:list', 25);
    expect(invoke).toHaveBeenCalledWith('agentConfig:list');
    expect(invoke).toHaveBeenCalledWith('agentConfig:upsert', { id: 'agent-1' });
    expect(invoke).toHaveBeenCalledWith('agentConfig:delete', 'agent-1');
    expect(invoke).toHaveBeenCalledWith('agentConfig:saveAll', [{ id: 'agent-1' }]);
    expect(invoke).toHaveBeenCalledWith('automationConfig:list');
    expect(invoke).toHaveBeenCalledWith('automationConfig:upsert', { id: 'auto-1' });
    expect(invoke).toHaveBeenCalledWith('automationConfig:delete', 'auto-1');
    expect(invoke).toHaveBeenCalledWith('automationConfig:saveAll', [{ id: 'auto-1' }]);
    expect(invoke).toHaveBeenCalledWith('automation:createRun', { id: 'auto-1' });
    expect(invoke).toHaveBeenCalledWith('automation:cancelRun', 'run-1');
    expect(removeListener).toHaveBeenCalledWith('runtime:diagnostic', expect.any(Function));
  });

  it('unwraps event payloads for listeners and removes listeners by channel', () => {
    const chunkCb = vi.fn();
    const updateCb = vi.fn();
    const automationCb = vi.fn();

    electronAPI.onChunk(chunkCb);
    electronAPI.onUpdateProgress(updateCb);
    electronAPI.onAutomationChange(automationCb);

    const onChunkHandler = on.mock.calls.find(([channel]) => channel === 'chat:chunk')[1];
    const onUpdateHandler = on.mock.calls.find(([channel]) => channel === 'update:progress')[1];
    const onAutomationHandler = on.mock.calls.find(([channel]) => channel === 'automation:change')[1];

    onChunkHandler({ sender: 'ignored' }, { chunk: 'hello', threadId: 't-1' });
    onUpdateHandler({ sender: 'ignored' }, { percent: 55 });
    onAutomationHandler({ sender: 'ignored' }, { run: { id: 'auto-run-1' } });

    expect(chunkCb).toHaveBeenCalledWith({ chunk: 'hello', threadId: 't-1' });
    expect(updateCb).toHaveBeenCalledWith({ percent: 55 });
    expect(automationCb).toHaveBeenCalledWith({ run: { id: 'auto-run-1' } });

    electronAPI.removeListeners('chat:chunk', 'update:progress');
    expect(removeAllListeners).toHaveBeenCalledWith('chat:chunk');
    expect(removeAllListeners).toHaveBeenCalledWith('update:progress');
  });
});
