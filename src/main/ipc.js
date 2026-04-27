const { ipcMain, dialog } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getModels, ping, streamChat } = require('./lmstudio');
const { getBot, validate: validateTelegram } = require('./telegram');
const { getStatus } = require('./git');
const settings = require('./settings');
const db = require('./db');

// Track active chat streams so we can abort them
const activeStreams = new Map();

function setupIPC(win) {

  // ── Git ───────────────────────────────────────────────────
  ipcMain.handle('git:status', (_, dirPath) => getStatus(dirPath));

  // ── Persistent DB ─────────────────────────────────────────
  ipcMain.handle('db:load',    (_, table)        => db.load(table));
  ipcMain.handle('db:saveAll', (_, table, items) => { db.saveAll(table, items); return true; });

  // ── Settings ──────────────────────────────────────────────
  ipcMain.handle('settings:load', () => settings.load());
  ipcMain.handle('settings:save', (_, data) => { settings.save(data); return true; });
  ipcMain.handle('settings:set',  (_, key, value) => { settings.set(key, value); return true; });
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
    return new Promise(resolve => {
      exec(cmd, { cwd: cwd || process.cwd(), timeout: 30000, shell: true }, (err, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: err ? (err.code ?? 1) : 0,
        });
      });
    });
  });

  // ── File system ───────────────────────────────────────────
  ipcMain.handle('fs:list', async (_, dirPath) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      return entries.map(e => ({
        name: e.name,
        isDir: e.isDirectory(),
        path: path.join(dirPath, e.name),
        ext: e.isDirectory() ? null : path.extname(e.name).slice(1),
      })).sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('fs:read', async (_, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return { content, error: null };
    } catch (e) {
      return { content: null, error: e.message };
    }
  });

  ipcMain.handle('fs:rename', async (_, { oldPath, newPath }) => {
    try {
      fs.renameSync(oldPath, newPath);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('fs:delete', async (_, filePath) => {
    try {
      if (fs.lstatSync(filePath).isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('fs:mkdir', async (_, dirPath) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
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
