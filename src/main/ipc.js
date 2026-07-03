const { ipcMain, dialog, app } = require('electron');
const fsp = require('fs/promises');
const path = require('path');
const { getModels, ping, streamChat } = require('./lmstudio');
const { getBot, validate: validateTelegram, findChatId } = require('./telegram');
const { getStatus, getDetailedStatus, stage, unstage, commit, getDiff, getLog, getBranches, checkout } = require('./git');
const settings = require('./settings');
const db = require('./db');
const workspace = require('./workspace');
const { executeTool, prepareStagedWrite } = require('./tools');
const agentRunner = require('./agentRunner');
const automationRunner = require('./automationRunner');
const automationScheduler = require('./automationScheduler');
const approvalQueue = require('./approvalQueue');
const threadStore = require('./threadStore');
const activityStore = require('./activityStore');
const telegramStore = require('./telegramStore');
const agentConfigs = require('./agentConfigs');
const automationConfigs = require('./automationConfigs');
const { readRecentDiagnostics } = require('./diagnostics');

// Track active chat streams so we can abort them
const activeStreams = new Map();

function setupIPC(win) {

  // ── System ────────────────────────────────────────────────
  ipcMain.handle('app:version', () => app.getVersion());

  // ── Git ───────────────────────────────────────────────────
  ipcMain.handle('git:status', (_, dirPath) => getStatus(dirPath));
  ipcMain.handle('git:detailedStatus', async (_, dirPath) => getDetailedStatus(dirPath));
  ipcMain.handle('git:stage', async (_, dirPath, paths) => stage(dirPath, paths));
  ipcMain.handle('git:unstage', async (_, dirPath, paths) => unstage(dirPath, paths));
  ipcMain.handle('git:commit', async (_, dirPath, message) => commit(dirPath, message));
  ipcMain.handle('git:diff', async (_, dirPath, filePath, staged) => getDiff(dirPath, filePath, staged));
  ipcMain.handle('git:log', async (_, dirPath, limit) => getLog(dirPath, limit));
  ipcMain.handle('git:branches', async (_, dirPath) => getBranches(dirPath));
  ipcMain.handle('git:checkout', async (_, dirPath, branch) => checkout(dirPath, branch));

  // ── Workspaces ────────────────────────────────────────────
  ipcMain.handle('workspace:list', async () => workspace.listWithMeta());
  ipcMain.handle('workspace:active', async () => workspace.getActive());
  ipcMain.handle('workspace:upsert', async (_, data) => {
    try { return { ok: true, workspace: await workspace.upsert(data) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('workspace:refreshMeta', async (_, idOrWorkspace) => {
    try { return { ok: true, workspace: await workspace.refreshWorkspaceMeta(idOrWorkspace) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('workspace:searchFiles', async (_, { workspaceId, query, limit } = {}) => {
    try { return { ok: true, ...(await workspace.searchFiles(workspaceId, query, limit)) }; }
    catch (e) { return { ok: false, error: e.message, results: [], total: 0, truncated: false }; }
  });

  // ── Agents ────────────────────────────────────────────────
  const forwardAgentEvent = ({ type, run }) => {
    win.webContents.send(type, run);
    win.webContents.send('agent:change', { type, run });
  };
  agentRunner.events.on('change', forwardAgentEvent);

  ipcMain.handle('agent:list', () => agentRunner.listRuns());
  ipcMain.handle('agent:create', async (_, data) => {
    try { return { ok: true, run: await agentRunner.createRun(data) }; }
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
  ipcMain.handle('automation:createRun', async (_, data) => {
    try { return { ok: true, run: await automationRunner.createRun(data) }; }
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
  ipcMain.handle('approval:applyStaged', async (_, { id, path: filePath }) => {
    try {
      const approval = approvalQueue.get(id);
      if (!approval) throw new Error(`Approval not found: ${id}`);
      if (filePath) {
        const content = approval.rawArgs?.content || approval.args?.content || '';
        await fsp.writeFile(filePath, content, 'utf8');
      }
      const result = { ...(approval.result || {}), ok: true, applied: true };
      return { ok: true, approval: approvalQueue.markApproved(id, result), result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
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
      if (approval.tool === 'write_file') {
        const result = await prepareStagedWrite(approval.rawArgs || approval.args, {
          threadId: approval.threadId,
          agentRunId: approval.agentRunId,
          workspacePath: approval.workspacePath,
        });
        return { ok: true, approval: approvalQueue.markStaged(id, result), result };
      }
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
  ipcMain.handle('workspace:setActive', async (_, idOrWorkspace) => {
    try { return { ok: true, workspace: await workspace.setActive(idOrWorkspace) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  // ── Persistent DB (legacy) ────────────────────────────────
  ipcMain.handle('db:load',    (_, table)        => db.load(table));
  ipcMain.handle('db:saveAll', (_, table, items) => {
    db.saveAll(table, items);
    if (table === 'automations') automationScheduler.reload();
    return true;
  });

  // ── Threads ──────────────────────────────────────────────
  ipcMain.handle('thread:list',    ()           => threadStore.list());
  ipcMain.handle('thread:upsert',  (_, item)    => ({ ok: true, item: threadStore.upsert(item) }));
  ipcMain.handle('thread:delete',  (_, id)      => ({ ok: true, items: threadStore.remove(id) }));
  ipcMain.handle('thread:saveAll', (_, items)   => ({ ok: true, items: threadStore.saveAll(items) }));
  ipcMain.handle('thread:fork', (_, sourceThreadId, fromMessageId) => {
    try {
      const forked = threadStore.fork(sourceThreadId, fromMessageId);
      return forked ? { ok: true, thread: forked } : { ok: false, error: 'Source thread or message not found' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Activity ─────────────────────────────────────────────
  ipcMain.handle('activity:listNotifications',     ()       => activityStore.listNotifications());
  ipcMain.handle('activity:upsertNotification',    (_, item)=> ({ ok: true, item: activityStore.upsertNotification(item) }));
  ipcMain.handle('activity:dismissNotification',   (_, id)  => ({ ok: true, items: activityStore.dismissNotification(id) }));
  ipcMain.handle('activity:markAllNotificationsRead', ()    => ({ ok: true, items: activityStore.markAllNotificationsRead() }));
  ipcMain.handle('activity:saveNotifications',     (_, items)=> ({ ok: true, items: activityStore.saveNotifications(items) }));
  ipcMain.handle('activity:listEvents',            ()       => activityStore.listEvents());
  ipcMain.handle('activity:upsertEvent',           (_, item)=> ({ ok: true, item: activityStore.upsertEvent(item) }));
  ipcMain.handle('activity:saveEvents',            (_, items)=> ({ ok: true, items: activityStore.saveEvents(items) }));

  // ── Telegram state ───────────────────────────────────────
  ipcMain.handle('telegramState:listMessages',  ()        => telegramStore.listMessages());
  ipcMain.handle('telegramState:upsertMessage', (_, item) => ({ ok: true, item: telegramStore.upsertMessage(item) }));
  ipcMain.handle('telegramState:deleteMessage', (_, id)   => ({ ok: true, items: telegramStore.removeMessage(id) }));
  ipcMain.handle('telegramState:saveMessages',  (_, items)=> ({ ok: true, items: telegramStore.saveMessages(items) }));

  // ── Agent configs ────────────────────────────────────────
  ipcMain.handle('agentConfig:list',    ()         => agentConfigs.list());
  ipcMain.handle('agentConfig:upsert',  (_, item)  => ({ ok: true, item: agentConfigs.upsert(item) }));
  ipcMain.handle('agentConfig:delete',  (_, id)    => ({ ok: true, items: agentConfigs.remove(id) }));
  ipcMain.handle('agentConfig:saveAll', (_, items) => ({ ok: true, items: agentConfigs.saveAll(items) }));

  // ── Automation configs ────────────────────────────────────
  ipcMain.handle('automationConfig:list',    ()         => automationConfigs.list());
  ipcMain.handle('automationConfig:upsert',  (_, item)  => ({ ok: true, item: automationConfigs.upsert(item) }));
  ipcMain.handle('automationConfig:delete',  (_, id)    => ({ ok: true, items: automationConfigs.remove(id) }));
  ipcMain.handle('automationConfig:saveAll', (_, items) => { const res = automationConfigs.saveAll(items); automationScheduler.reload(); return { ok: true, items: res }; });

  // ── Runtime diagnostics ─────────────────────────────────
  ipcMain.handle('diagnostics:list', (_, limit) => readRecentDiagnostics(limit || 100));

  // ── Settings ──────────────────────────────────────────────
  ipcMain.handle('settings:load', () => settings.load());
  ipcMain.handle('settings:save', (_, data) => { settings.save(data); return true; });
  ipcMain.handle('settings:set',  (_, key, value) => {
    settings.set(key, value);
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
      for await (const item of streamChat(messages, threadId, model, thinking, lmUrl, { ctrl })) {
        if (ctrl.cancelled) break;
        if (item.type === 'text') {
          win.webContents.send('chat:chunk', { chunk: item.content, threadId });
        } else if (item.type === 'thinking') {
          win.webContents.send('chat:thinking', { chunk: item.content, threadId });
        } else if (item.type === 'tool_call') {
          win.webContents.send('chat:tool_call', { id: item.id, name: item.name, args: item.args, threadId });
        } else if (item.type === 'tool_result') {
          win.webContents.send('chat:tool_result', { id: item.id, name: item.name, result: item.result, threadId });
        } else if (item.type === 'resume') {
          win.webContents.send('chat:resume', { threadId });
        } else if (item.type === 'redacted') {
          // Cloud-context redaction notice — forwarded so the renderer can
          // show a "N secrets were redacted before sending to <provider>"
          // badge on the message.
          win.webContents.send('chat:redacted', { count: item.count, provider: item.provider, threadId });
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
      bot.startPolling(async msg => {
        // Save the inbound message to database so we have history
        telegramStore.upsertMessage({
          direction: 'inbound',
          from: msg.from?.first_name || 'User',
          text: msg.text || '',
          chatId: String(msg.chat.id),
          date: msg.date,
          status: 'received'
        });

        // Send the inbound message event to frontend immediately (with original fields matching test contract)
        win.webContents.send('telegram:message', {
          chatId: msg.chat.id,
          from: msg.from?.first_name || 'User',
          text: msg.text || '',
          date: msg.date,
        });

        const triggered = await automationScheduler.handleTelegramMessage(msg);

        // If it didn't trigger any command or keyword automation, trigger AI chat response!
        const isCommand = (msg.text || '').trim().startsWith('/');
        if ((!triggered || triggered.length === 0) && !isCommand) {
          await automationScheduler.respondToTelegramMessage(bot, msg, (replyText) => {
            // Callback to notify the frontend of the outbound AI reply!
            win.webContents.send('telegram:message', {
              id: `tg-out-${msg.chat.id}-${Date.now()}`,
              direction: 'outbound',
              from: 'Meg',
              text: replyText,
              chatId: msg.chat.id,
              date: Math.floor(Date.now() / 1000),
            });
          });
        }
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

  // ── MCP servers ───────────────────────────────────────────
  // Connect to external Model Context Protocol servers and surface their
  // tools alongside Meg's built-in tools. The renderer can list/add/remove
  // servers and test connections.
  const mcp = require('./mcpClient');
  const forwardMcpEvent = (payload) => {
    win.webContents.send('mcp:change', payload);
  };
  mcp.events.on('change', forwardMcpEvent);

  ipcMain.handle('mcp:listServers', () => mcp.listServers());
  ipcMain.handle('mcp:saveServers', (_, servers) => {
    mcp.saveServers(servers);
    return { ok: true };
  });
  ipcMain.handle('mcp:connect', async (_, config) => {
    try {
      await mcp.connect(config);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('mcp:disconnect', (_, serverId) => {
    mcp.disconnect(serverId);
    return { ok: true };
  });
  ipcMain.handle('mcp:connectAll', async () => {
    try {
      await mcp.connectAll();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('mcp:listTools', () => mcp.getToolDefinitions());

  // ── Custom skills (plugin system) ───────────────────────────────────
  // Load user-defined skill JSON files from the userData/skills/ directory.
  // The renderer merges these with the built-in SKILLS array; custom skills
  // override built-ins on id collision.
  const customSkills = require('./customSkills');
  ipcMain.handle('skills:listCustom', () => customSkills.loadCustomSkills());
  ipcMain.handle('skills:getDir', () => customSkills.getSkillsDirPath());
  ipcMain.handle('skills:reload', () => {
    customSkills.invalidateCache();
    return { ok: true, count: customSkills.loadCustomSkills().length };
  });
  ipcMain.handle('skills:save', (_, skillJson) => {
    try {
      const dir = customSkills.ensureSkillsDir();
      const skill = JSON.parse(skillJson);
      if (!skill.id) return { ok: false, error: 'Skill id is required' };
      const filePath = path.join(dir, `${skill.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(skill, null, 2), 'utf8');
      customSkills.invalidateCache();
      return { ok: true, path: filePath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('skills:delete', (_, skillId) => {
    try {
      const dir = customSkills.getSkillsDirPath();
      const filePath = path.join(dir, `${skillId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        customSkills.invalidateCache();
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── OS keychain (safeStorage) ──────────────────────────────────────
  // Encrypt API keys + Telegram token via the OS-native credential store.
  // Falls back to plaintext settings if safeStorage is unavailable.
  const keychain = require('./keychain');
  ipcMain.handle('keychain:isAvailable', () => keychain.isAvailable());
  ipcMain.handle('keychain:get', (_, key) => keychain.getSecret(key));
  ipcMain.handle('keychain:set', (_, key, value) => {
    try { keychain.setSecret(key, value); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('keychain:delete', (_, key) => {
    keychain.deleteSecret(key);
    return { ok: true };
  });
  ipcMain.handle('keychain:list', () => {
    const all = keychain.loadAll();
    return Object.keys(all).map(k => ({ key: k, hasValue: !!all[k] }));
  });
  ipcMain.handle('keychain:migrate', () => keychain.migrateFromPlaintext());

  // ── Screenshot capture ─────────────────────────────────────────────
  // Grab the screen or a specific window as a PNG data URL. The renderer
  // attaches the result to the next chat message as a vision input.
  const screenshot = require('./screenshot');
  ipcMain.handle('screenshot:captureScreen', async () => screenshot.captureScreen());
  ipcMain.handle('screenshot:captureWindow', async (_, windowId) => screenshot.captureWindow(windowId));
  ipcMain.handle('screenshot:listSources', async () => screenshot.listSources());

  // ── Prompt templates ───────────────────────────────────────────────
  // Save/reuse common prompts. Built-ins ship with Meg; user templates
  // override on id collision.
  const promptTemplates = require('./promptTemplates');
  ipcMain.handle('templates:list', () => promptTemplates.getAllTemplates());
  ipcMain.handle('templates:listUser', () => promptTemplates.getUserTemplates());
  ipcMain.handle('templates:save', (_, template) => {
    try { return { ok: true, template: promptTemplates.saveTemplate(template) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('templates:delete', (_, id) => {
    promptTemplates.deleteTemplate(id);
    return { ok: true };
  });

  // ── Conversation export/import ─────────────────────────────────────
  // Export a thread as JSON or Markdown; import restores it.
  ipcMain.handle('thread:export', async (_, threadId, format = 'json') => {
    try {
      const thread = threadStore.list().find(t => t.id === threadId);
      if (!thread) return { ok: false, error: 'Thread not found' };
      if (format === 'markdown' || format === 'md') {
        const md = exportThreadAsMarkdown(thread);
        return { ok: true, content: md, filename: `${sanitizeFilename(thread.title)}-${thread.id}.md` };
      }
      return { ok: true, content: JSON.stringify(thread, null, 2), filename: `${sanitizeFilename(thread.title)}-${thread.id}.json` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('thread:import', async (_, content, format = 'json') => {
    try {
      let thread;
      if (format === 'json') {
        thread = JSON.parse(content);
      } else {
        thread = importThreadFromMarkdown(content);
      }
      // Give it a fresh id so it doesn't collide with an existing thread.
      thread.id = `chat-${Date.now()}`;
      thread.createdAt = new Date().toISOString();
      thread.updatedAt = new Date().toISOString();
      thread.forkedFrom = { imported: true, at: new Date().toISOString() };
      const saved = threadStore.upsert(thread);
      return { ok: true, thread: saved };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

// ─── Conversation export/import helpers ───────────────────────────────────

function sanitizeFilename(name) {
  return String(name || 'chat').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'chat';
}

function exportThreadAsMarkdown(thread) {
  const lines = [];
  lines.push(`# ${thread.title || 'Conversation'}`);
  lines.push('');
  lines.push(`> Exported from Meg on ${new Date().toISOString()}`);
  lines.push(`> Thread ID: \`${thread.id}\``);
  if (thread.createdAt) lines.push(`> Created: ${thread.createdAt}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  for (const msg of thread.messages || []) {
    if (msg.role === 'user') {
      lines.push(`## You`);
      lines.push('');
      lines.push(msg.text || '');
      lines.push('');
    } else if (msg.role === 'meg') {
      lines.push(`## Meg`);
      lines.push('');
      if (msg.thinking) {
        lines.push('<details><summary>Thinking</summary>');
        lines.push('');
        lines.push(msg.thinking);
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }
      lines.push(msg.text || '');
      lines.push('');
    } else if (msg.role === 'tool_call') {
      lines.push(`### 🔧 Tool: \`${msg.name}\``);
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(msg.args, null, 2));
      lines.push('```');
      if (msg.result) {
        lines.push('');
        lines.push('*Result:*');
        lines.push('```');
        lines.push(typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result, null, 2));
        lines.push('```');
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

function importThreadFromMarkdown(content) {
  // Simple parser: extracts the title from the first # heading, then
  // splits on ## headings to recover messages. This is best-effort —
  // round-tripping through markdown loses tool_call structure, so we
  // import as user/meg text pairs only.
  const lines = content.split('\n');
  let title = 'Imported conversation';
  const messages = [];
  let currentRole = null;
  let currentText = [];

  const flush = () => {
    if (currentRole && currentText.length) {
      messages.push({
        id: `msg-${Date.now()}-${messages.length}`,
        role: currentRole,
        text: currentText.join('\n').trim(),
      });
    }
    currentText = [];
  };

  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.slice(2).trim();
    } else if (line.startsWith('## You')) {
      flush();
      currentRole = 'user';
    } else if (line.startsWith('## Meg')) {
      flush();
      currentRole = 'meg';
    } else if (line.startsWith('---')) {
      flush();
    } else if (currentRole) {
      currentText.push(line);
    }
  }
  flush();

  return {
    title,
    subtitle: 'Imported from Markdown',
    messages,
    iconName: 'chat',
  };
}

module.exports = { setupIPC };
