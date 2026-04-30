const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Chat ──────────────────────────────────────────────────
  sendChat(messages, threadId, model, thinking, tools) {
    ipcRenderer.send('chat:send', { messages, threadId, model, thinking, tools });
  },
  abortChat(threadId) {
    ipcRenderer.send('chat:abort', { threadId });
  },
  onChunk(cb)      { ipcRenderer.on('chat:chunk',       (_, d) => cb(d)); },
  onDone(cb)       { ipcRenderer.on('chat:done',        (_, d) => cb(d)); },
  onError(cb)      { ipcRenderer.on('chat:error',       (_, d) => cb(d)); },
  onToolCall(cb)   { ipcRenderer.on('chat:tool_call',   (_, d) => cb(d)); },
  onToolResult(cb) { ipcRenderer.on('chat:tool_result', (_, d) => cb(d)); },
  onWaitingApproval(cb) { ipcRenderer.on('chat:waiting_approval', (_, d) => cb(d)); },
  onResume(cb)     { ipcRenderer.on('chat:resume',      (_, d) => cb(d)); },
  onThinking(cb)   { ipcRenderer.on('chat:thinking',    (_, d) => cb(d)); },
  
  removeListeners(...channels) {
    channels.forEach(ch => ipcRenderer.removeAllListeners(ch));
  },

  // ── Models ────────────────────────────────────────────────
  getModels()  { return ipcRenderer.invoke('models:list'); },
  ping()       { return ipcRenderer.invoke('lmstudio:ping'); },

  // ── Settings ──────────────────────────────────────────────
  loadSettings()        { return ipcRenderer.invoke('settings:load'); },
  saveSettings(data)    { return ipcRenderer.invoke('settings:save', data); },
  setSetting(key, val)  { return ipcRenderer.invoke('settings:set', key, val); },
  getSetting(key)       { return ipcRenderer.invoke('settings:get', key); },

  // ── Git ───────────────────────────────────────────────────
  gitStatus(dirPath)    { return ipcRenderer.invoke('git:status', dirPath); },

  // ── Workspaces ────────────────────────────────────────────
  listWorkspaces()      { return ipcRenderer.invoke('workspace:list'); },
  getActiveWorkspace()  { return ipcRenderer.invoke('workspace:active'); },
  upsertWorkspace(data) { return ipcRenderer.invoke('workspace:upsert', data); },
  refreshWorkspaceMeta(idOrWorkspace) { return ipcRenderer.invoke('workspace:refreshMeta', idOrWorkspace); },
  searchWorkspaceFiles(workspaceId, query, limit) { return ipcRenderer.invoke('workspace:searchFiles', { workspaceId, query, limit }); },
  setActiveWorkspace(idOrWorkspace) { return ipcRenderer.invoke('workspace:setActive', idOrWorkspace); },

  // ── Threads ──────────────────────────────────────────────
  listThreads()         { return ipcRenderer.invoke('thread:list'); },
  upsertThread(item)    { return ipcRenderer.invoke('thread:upsert', item); },
  deleteThread(id)      { return ipcRenderer.invoke('thread:delete', id); },
  saveThreads(items)    { return ipcRenderer.invoke('thread:saveAll', items); },

  // ── Activity ─────────────────────────────────────────────
  listNotifications()   { return ipcRenderer.invoke('activity:listNotifications'); },
  upsertNotification(item) { return ipcRenderer.invoke('activity:upsertNotification', item); },
  dismissNotification(id) { return ipcRenderer.invoke('activity:dismissNotification', id); },
  markAllNotificationsRead() { return ipcRenderer.invoke('activity:markAllNotificationsRead'); },
  saveNotifications(items) { return ipcRenderer.invoke('activity:saveNotifications', items); },
  listEvents()          { return ipcRenderer.invoke('activity:listEvents'); },
  upsertEvent(item)     { return ipcRenderer.invoke('activity:upsertEvent', item); },
  saveEvents(items)     { return ipcRenderer.invoke('activity:saveEvents', items); },

  // ── Telegram state ───────────────────────────────────────
  listTelegramMessages() { return ipcRenderer.invoke('telegramState:listMessages'); },
  upsertTelegramMessage(item) { return ipcRenderer.invoke('telegramState:upsertMessage', item); },
  deleteTelegramMessage(id) { return ipcRenderer.invoke('telegramState:deleteMessage', id); },
  saveTelegramMessages(items) { return ipcRenderer.invoke('telegramState:saveMessages', items); },

  // ── Runtime diagnostics ─────────────────────────────────
  listRuntimeDiagnostics(limit) { return ipcRenderer.invoke('diagnostics:list', limit); },
  onRuntimeDiagnostic(cb) {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('runtime:diagnostic', handler);
    return () => ipcRenderer.removeListener('runtime:diagnostic', handler);
  },

  // ── Agent configs ────────────────────────────────────────
  listAgentConfigs()    { return ipcRenderer.invoke('agentConfig:list'); },
  upsertAgentConfig(item) { return ipcRenderer.invoke('agentConfig:upsert', item); },
  deleteAgentConfig(id) { return ipcRenderer.invoke('agentConfig:delete', id); },
  saveAgentConfigs(items) { return ipcRenderer.invoke('agentConfig:saveAll', items); },

  // ── Agents ────────────────────────────────────────────────
  listAgentRuns()       { return ipcRenderer.invoke('agent:list'); },
  createAgentRun(data)  { return ipcRenderer.invoke('agent:create', data); },
  cancelAgentRun(id)    { return ipcRenderer.invoke('agent:cancel', id); },
  onAgentChange(cb)     {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('agent:change', handler);
    return () => ipcRenderer.removeListener('agent:change', handler);
  },

  // ── Automations ──────────────────────────────────────────
  listAutomationConfigs()   { return ipcRenderer.invoke('automationConfig:list'); },
  upsertAutomationConfig(item) { return ipcRenderer.invoke('automationConfig:upsert', item); },
  deleteAutomationConfig(id) { return ipcRenderer.invoke('automationConfig:delete', id); },
  saveAutomationConfigs(items) { return ipcRenderer.invoke('automationConfig:saveAll', items); },
  listAutomationRuns()      { return ipcRenderer.invoke('automation:listRuns'); },
  createAutomationRun(data) { return ipcRenderer.invoke('automation:createRun', data); },
  cancelAutomationRun(id)   { return ipcRenderer.invoke('automation:cancelRun', id); },
  onAutomationChange(cb)    {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('automation:change', handler);
    return () => ipcRenderer.removeListener('automation:change', handler);
  },

  // ── Tool approvals ────────────────────────────────────────
  listApprovals()       { return ipcRenderer.invoke('approval:list'); },
  approveToolCall(id)   { return ipcRenderer.invoke('approval:approve', id); },
  applyStagedApproval(id, path) { return ipcRenderer.invoke('approval:applyStaged', { id, path }); },
  denyToolCall(id)      { return ipcRenderer.invoke('approval:deny', id); },
  onApprovalChange(cb)  { ipcRenderer.on('approval:change', (_, d) => cb(d)); },

  // ── Terminal ──────────────────────────────────────────────
  execCommand(cmd, cwd) { return ipcRenderer.invoke('terminal:exec', { cmd, cwd }); },

  // ── File system ───────────────────────────────────────────
  listDir(dirPath)      { return ipcRenderer.invoke('fs:list', dirPath); },
  readFile(filePath)    { return ipcRenderer.invoke('fs:read', filePath); },
  writeFile(filePath, content) { return ipcRenderer.invoke('fs:write', { filePath, content }); },
  renameFile(oldPath, newPath) { return ipcRenderer.invoke('fs:rename', { oldPath, newPath }); },
  deleteFile(filePath)  { return ipcRenderer.invoke('fs:delete', filePath); },
  mkdir(dirPath)        { return ipcRenderer.invoke('fs:mkdir', dirPath); },

  // ── Dialogs ───────────────────────────────────────────────
  openFolder()  { return ipcRenderer.invoke('dialog:openFolder'); },
  openFile()    { return ipcRenderer.invoke('dialog:openFile'); },

  // ── Telegram ──────────────────────────────────────────────
  validateTelegramToken(token) { return ipcRenderer.invoke('telegram:validate', token); },
  findTelegramChatId(token)    { return ipcRenderer.invoke('telegram:findChatId', token); },
  sendTelegram({ token, chatId, text }) {
    return ipcRenderer.invoke('telegram:send', { token, chatId, text });
  },
  startTelegramPolling(token) {
    return ipcRenderer.invoke('telegram:startPolling', { token });
  },
  stopTelegramPolling(token) {
    ipcRenderer.send('telegram:stopPolling', { token });
  },
  onTelegramMessage(cb) {
    ipcRenderer.on('telegram:message', (_, d) => cb(d));
  },

  // ── System ────────────────────────────────────────────────
  getVersion() { return ipcRenderer.invoke('app:version'); },

  // ── Updates ──────────────────────────────────────────────
  checkForUpdates() { ipcRenderer.send('update:check'); },
  downloadUpdate()   { ipcRenderer.send('update:download'); },
  installUpdate()    { ipcRenderer.send('update:install'); },
  onUpdateAvailable(cb)   { ipcRenderer.on('update:available', (_, d) => cb(d)); },
  onUpdateNotAvailable(cb) { ipcRenderer.on('update:not-available', (_, d) => cb(d)); },
  onUpdateProgress(cb)    { ipcRenderer.on('update:progress', (_, d) => cb(d)); },
  onUpdateDownloaded(cb)  { ipcRenderer.on('update:downloaded', (_, d) => cb(d)); },
  onUpdateError(cb)       { ipcRenderer.on('update:error', (_, d) => cb(d)); },

  // ── Window controls ───────────────────────────────────────
  minimize() { ipcRenderer.send('win:minimize'); },
  maximize() { ipcRenderer.send('win:maximize'); },
  close()    { ipcRenderer.send('win:close'); },
});
