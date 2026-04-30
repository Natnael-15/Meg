const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Chat ──────────────────────────────────────────────────
  sendChat(messages, threadId, model, thinking) {
    ipcRenderer.send('chat:send', { messages, threadId, model, thinking });
  },
  abortChat(threadId) {
    ipcRenderer.send('chat:abort', { threadId });
  },
  onChunk(cb)      { ipcRenderer.on('chat:chunk',       (_, d) => cb(d)); },
  onDone(cb)       { ipcRenderer.on('chat:done',        (_, d) => cb(d)); },
  onError(cb)      { ipcRenderer.on('chat:error',       (_, d) => cb(d)); },
  onToolCall(cb)   { ipcRenderer.on('chat:tool_call',   (_, d) => cb(d)); },
  onToolResult(cb) { ipcRenderer.on('chat:tool_result', (_, d) => cb(d)); },
  onResume(cb)     { ipcRenderer.on('chat:resume',      (_, d) => cb(d)); },
  onThinking(cb)   { ipcRenderer.on('chat:thinking',    (_, d) => cb(d)); },
  
  removeListeners(...channels) {
    channels.forEach(ch => ipcRenderer.removeAllListeners(ch));
  },

  // ── Persistent DB ─────────────────────────────────────────
  dbLoad:    table        => ipcRenderer.invoke('db:load', table),
  dbSaveAll: (table, items) => ipcRenderer.invoke('db:saveAll', table, items),

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
