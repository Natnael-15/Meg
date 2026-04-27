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

  // ── Terminal ──────────────────────────────────────────────
  execCommand(cmd, cwd) { return ipcRenderer.invoke('terminal:exec', { cmd, cwd }); },

  // ── File system ───────────────────────────────────────────
  listDir(dirPath)      { return ipcRenderer.invoke('fs:list', dirPath); },
  readFile(filePath)    { return ipcRenderer.invoke('fs:read', filePath); },
  renameFile(oldPath, newPath) { return ipcRenderer.invoke('fs:rename', { oldPath, newPath }); },
  deleteFile(filePath)  { return ipcRenderer.invoke('fs:delete', filePath); },
  mkdir(dirPath)        { return ipcRenderer.invoke('fs:mkdir', dirPath); },

  // ── Dialogs ───────────────────────────────────────────────
  openFolder()  { return ipcRenderer.invoke('dialog:openFolder'); },
  openFile()    { return ipcRenderer.invoke('dialog:openFile'); },

  // ── Telegram ──────────────────────────────────────────────
  validateTelegramToken(token) { return ipcRenderer.invoke('telegram:validate', token); },
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

  // ── Updates ──────────────────────────────────────────────
  checkForUpdates() { ipcRenderer.send('update:check'); },
  downloadUpdate()   { ipcRenderer.send('update:download'); },
  installUpdate()    { ipcRenderer.send('update:install'); },
  onUpdateAvailable(cb)   { ipcRenderer.on('update:available', (_, d) => cb(d)); },
  onUpdateProgress(cb)    { ipcRenderer.on('update:progress', (_, d) => cb(d)); },
  onUpdateDownloaded(cb)  { ipcRenderer.on('update:downloaded', (_, d) => cb(d)); },
  onUpdateError(cb)       { ipcRenderer.on('update:error', (_, d) => cb(d)); },

  // ── Window controls ───────────────────────────────────────
  minimize() { ipcRenderer.send('win:minimize'); },
  maximize() { ipcRenderer.send('win:maximize'); },
  close()    { ipcRenderer.send('win:close'); },
});
