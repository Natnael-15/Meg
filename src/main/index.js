const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { setupIPC } = require('./ipc');
const settings = require('./settings');

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.allowPrerelease = true;

function createWindow() {
  const win = new BrowserWindow({
...
  setupIPC(win);

  // ── Auto Updater Events ──
    backgroundColor: '#faf9f7',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // allow loading tweaks-panel.jsx from the same local directory
      webSecurity: false,
    },
    show: false,
  });

  win.once('ready-to-show', () => {
    win.show();
    // Default to open for now, F12 will toggle
    win.webContents.openDevTools();
  });

  // Toggle DevTools with F12
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      win.webContents.toggleDevTools();
    }
  });

  win.loadFile(path.join(__dirname, '../../Meg.html')).catch(e => {
    console.error('CRASH: Failed to load index.html', e);
  });

  setupIPC(win);
  updateAuthHeader();

  // ── Auto Updater Events ──
  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update:available', info);
  });

  autoUpdater.on('update-not-available', () => {
    win.webContents.send('update:not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send('update:progress', progress);
  });

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update:downloaded');
  });

  autoUpdater.on('error', (err) => {
    win.webContents.send('update:error', err.message);
  });

  // Check for updates after 3 seconds
  setTimeout(() => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  }, 3000);
}

// ── Update Control IPC ──
ipcMain.on('update:check', () => {
  autoUpdater.checkForUpdates();
});

ipcMain.on('update:download', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.on('update:install', () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
