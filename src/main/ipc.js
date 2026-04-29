const { ipcMain, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { getModels, ping, streamChat } = require('./lmstudio');
const { getBot, validate: validateTelegram, findChatId } = require('./telegram');
const { getStatus } = require('./git');
const settings = require('./settings');
const db = require('./db');
const workspace = require('./workspace');
const { executeTool } = require('./tools');
const agentRunner = require('./agentRunner');
const automationRunner = require('./automationRunner');
const automationScheduler = require('./automationScheduler');
const approvalQueue = require('./approvalQueue');

// Track active chat streams so we can abort them
const activeStreams = new Map();

function setupIPC(win) {

  // ── System ────────────────────────────────────────────────
  ipcMain.handle('app:version', () => app.getVersion());

  // ── Git ───────────────────────────────────────────────────
  ipcMain.handle('git:status', (_, dirPath) => getStatus(dirPath));

  // ── Workspaces ────────────────────────────────────────────
  ipcMain.handle('workspace:list', () => workspace.listWithMeta());
  ipcMain.handle('workspace:active', () => workspace.getActive());
  ipcMain.handle('workspace:upsert', (_, data) => {
    try { return { ok: true, workspace: workspace.upsert(data) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('workspace:refreshMeta', (_, idOrWorkspace) => {
    try { return { ok: true, workspace: workspace.refreshWorkspaceMeta(idOrWorkspace) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('workspace:searchFiles', (_, { workspaceId, query, limit } = {}) => {
    try { return { ok: true, ...workspace.searchFiles(workspaceId, query, limit) }; }
    catch (e) { return { ok: false, error: e.message, results: [], total: 0, truncated: false }; }
  });

  // ── Agents ────────────────────────────────────────────────
  const forwardAgentEvent = ({ type, run }) => {
    win.webContents.send(type, run);
    win.webContents.send('agent:change', { type, run });
  };
  agentRunner.events.on('change', forwardAgentEvent);

  ipcMain.handle('agent:list', () => agentRunner.listRuns());
  ipcMain.handle('agent:create', (_, data) => {
    try { return { ok: true, run: agentRunner.createRun(data) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('agent:cancel', (_, id) => {
    try { return { ok: true, run: agentRunner.cancelRun(id) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  // ── Automations ───────────────────────────────────────────
  const forwardAutomationEvent = ({ type, run }) => {
    win.webContents.send(type, run);
    win.webContents.send('automation:change', { type, run });
  };
  automationRunner.events.on('change', forwardAutomationEvent);

  ipcMain.handle('automation:listRuns', () => automationRunner.listRuns());
  ipcMain.handle('automation:createRun', (_, data) => {
    try { return { ok: true, run: automationRunner.createRun(data) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('automation:cancelRun', (_, id) => {
    try { return { ok: true, run: automationRunner.cancelRun(id) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  // ── Tool approvals ────────────────────────────────────────
  const forwardApprovalEvent = ({ type, approval }) => {
    win.webContents.send(type, approval);
    win.webContents.send('approval:change', { type, approval });
  };
  approvalQueue.events.on('change', forwardApprovalEvent);

  ipcMain.handle('approval:list', () => approvalQueue.list());
  ipcMain.handle('approval:deny', (_, id) => {
    try { return { ok: true, approval: approvalQueue.deny(id) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('approval:approve', async (_, id) => {
    try {
      const approval = approvalQueue.get(id);
      if (!approval) throw new Error(`Approval not found: ${id}`);
      if (approval.status !== 'pending') throw new Error(`Approval is already ${approval.status}`);
      approvalQueue.markRunning(id);
      const result = await executeTool(approval.tool, approval.rawArgs || approval.args, {
        threadId: approval.threadId,
        agentRunId: approval.agentRunId,
        workspacePath: approval.workspacePath,
        approvalId: approval.id,
      });
      if (result?.error) return { ok: false, approval: approvalQueue.markFailed(id, result.error), result };
      return { ok: true, approval: approvalQueue.markApproved(id, result), result };
    } catch (e) {
      try { return { ok: false, approval: approvalQueue.markFailed(id, e), error: e.message }; }
      catch { return { ok: false, error: e.message }; }
    }
  });
  ipcMain.handle('workspace:setActive', (_, idOrWorkspace) => {
    try { return { ok: true, workspace: workspace.setActive(idOrWorkspace) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  // ── Persistent DB ─────────────────────────────────────────
  ipcMain.handle('db:load',    (_, table)        => db.load(table));
  ipcMain.handle('db:saveAll', (_, table, items) => {
    db.saveAll(table, items);
    if (table === 'automations') automationScheduler.reload();
    return true;
  });

  // ── Settings ──────────────────────────────────────────────
  ipcMain.handle('settings:load', () => settings.load());
  ipcMain.handle('settings:save', (_, data) => { settings.save(data); return true; });
  ipcMain.handle('settings:set',  (_, key, value) => {
    settings.set(key, value);
    if (key === 'githubToken') {
      // Refresh auth header in main process
      const main = require('./index');
      if (main.updateAuthHeader) main.updateAuthHeader();
    }
    return true;
  });
  ipcMain.handle('settings:get',  (_, key) => settings.get(key));

  // ── LM Studio models ──────────────────────────────────────
  ipcMain.handle('models:list', async () => {
    const url = settings.get('lmStudioUrl') || 'http://127.0.0.1:1234';
    try { return await getModels(url); } catch { return []; }
  });
  ipcMain.handle('lmstudio:ping', async () => {
    const url = settings.get('lmStudioUrl') || 'http://127.0.0.1:1234';
    return ping(url);
  });

  // ── Chat streaming ────────────────────────────────────────
  ipcMain.on('chat:send', async (event, { messages, threadId, model, thinking }) => {
    if (activeStreams.has(threadId)) {
      activeStreams.get(threadId).cancelled = true;
      activeStreams.delete(threadId);
    }
    const ctrl = { cancelled: false };
    activeStreams.set(threadId, ctrl);
    try {
      const lmUrl = settings.get('lmStudioUrl') || 'http://127.0.0.1:1234';
      for await (const item of streamChat(messages, threadId, model, thinking, lmUrl)) {
        if (ctrl.cancelled) break;
        if (item.type === 'text') {
          win.webContents.send('chat:chunk', { chunk: item.content, threadId });
        } else if (item.type === 'tool_call') {
          win.webContents.send('chat:tool_call', { id: item.id, name: item.name, args: item.args, threadId });
        } else if (item.type === 'tool_result') {
          win.webContents.send('chat:tool_result', { id: item.id, name: item.name, result: item.result, threadId });
        } else if (item.type === 'resume') {
          win.webContents.send('chat:resume', { threadId });
        }
      }
      if (!ctrl.cancelled) win.webContents.send('chat:done', { threadId });
    } catch (e) {
      win.webContents.send('chat:error', { error: e.message, threadId });
    } finally {
      activeStreams.delete(threadId);
    }
  });

  ipcMain.on('chat:abort', (_, { threadId }) => {
    if (activeStreams.has(threadId)) {
      activeStreams.get(threadId).cancelled = true;
      activeStreams.delete(threadId);
    }
  });

  // ── Terminal ──────────────────────────────────────────────
  ipcMain.handle('terminal:exec', (_, { cmd, cwd }) => {
    return executeTool('run_command', { command: cmd, cwd }, { threadId: 'terminal', bypassPermissions: true });
  });

  // ── File system ───────────────────────────────────────────
  ipcMain.handle('fs:list', async (_, dirPath) => {
    const result = await executeTool('list_directory', { path: dirPath }, { threadId: 'manual-fs:list', skipApproval: true });
    return result?.error ? { error: result.error } : result.entries;
  });

  ipcMain.handle('fs:read', async (_, filePath) => {
    const result = await executeTool('read_file', { path: filePath }, { threadId: 'manual-fs:read', skipApproval: true });
    return result?.error ? { content: null, error: result.error } : { content: result.content, error: null };
  });

  ipcMain.handle('fs:write', async (_, { filePath, content }) => {
    return executeTool('write_file', { path: filePath, content }, { threadId: 'manual-save', skipApproval: true });
  });

  ipcMain.handle('fs:rename', async (_, { oldPath, newPath }) => {
    return executeTool('rename_path', { oldPath, newPath }, { threadId: 'manual-fs:rename', skipApproval: true });
  });

  ipcMain.handle('fs:delete', async (_, filePath) => {
    return executeTool('delete_path', { path: filePath }, { threadId: 'manual-fs:delete', skipApproval: true });
  });

  ipcMain.handle('fs:mkdir', async (_, dirPath) => {
    return executeTool('make_directory', { path: dirPath }, { threadId: 'manual-fs:mkdir', skipApproval: true });
  });

  // ── Folder / file dialogs ─────────────────────────────────
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Open workspace folder',
    });
    return result; // { canceled, filePaths }
  });

  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      title: 'Add files to context',
    });
    return result;
  });

  // ── Telegram ──────────────────────────────────────────────
  ipcMain.handle('telegram:validate', async (_, token) => {
    return validateTelegram(token);
  });

  ipcMain.handle('telegram:findChatId', async (_, token) => {
    return findChatId(token);
  });

  ipcMain.handle('telegram:send', async (_, { token, chatId, text }) => {
    try {
      const bot = getBot(token);
      if (!bot) return { ok: false, error: 'No token' };
      return await bot.sendMessage(chatId, text);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('telegram:startPolling', async (_, { token }) => {
    try {
      const bot = getBot(token);
      if (!bot) return { ok: false, error: 'No token' };
      bot.startPolling(msg => {
        automationScheduler.handleTelegramMessage(msg);
        win.webContents.send('telegram:message', {
          chatId: msg.chat.id,
          from: msg.from?.first_name || 'User',
          text: msg.text || '',
          date: msg.date,
        });
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.on('telegram:stopPolling', (_, { token }) => {
    const bot = getBot(token);
    bot?.stopPolling();
  });

  // ── Window controls ───────────────────────────────────────
  ipcMain.on('win:minimize', () => win.minimize());
  ipcMain.on('win:maximize', () => {
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
  });
  ipcMain.on('win:close', () => win.close());
}

module.exports = { setupIPC };
