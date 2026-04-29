const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { setupIPC } = require('./ipc');
const automationScheduler = require('./automationScheduler');
const {
  attachProcessDiagnostics,
  attachWindowDiagnostics,
  createDiagnosticReporter,
  getDiagnosticsPath,
} = require('./diagnostics');

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.allowPrerelease = true;

const APP_ICON = path.join(__dirname, '../../build/icons/meg-icon.png');
const SESSION_DATA_PATH = path.join(app.getPath('userData'), 'session-data');
app.setPath('sessionData', SESSION_DATA_PATH);

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

attachProcessDiagnostics(createDiagnosticReporter());

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: '#faf9f7',
    icon: fs.existsSync(APP_ICON) ? APP_ICON : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    show: false,
  });
  const reportRuntime = createDiagnosticReporter(win);
  attachWindowDiagnostics(win, reportRuntime);
  reportRuntime('window:created', { packaged: app.isPackaged, diagnosticsPath: getDiagnosticsPath() });

  win.once('ready-to-show', () => {
    win.show();
    reportRuntime('window:ready-to-show');
  });

  // Toggle DevTools with F12
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      win.webContents.toggleDevTools();
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
  const rendererIndex = path.join(__dirname, '../../dist/renderer/index.html');

  if (!app.isPackaged) {
    win.loadURL(devServerUrl).catch(e => {
      reportRuntime('renderer:dev-load-failed', { devServerUrl, error: e.message }, 'error');
      if (fs.existsSync(rendererIndex)) {
        reportRuntime('renderer:dev-fallback-to-build', { rendererIndex });
        return win.loadFile(rendererIndex);
      }
      throw e;
    });
  } else {
    if (!fs.existsSync(rendererIndex)) {
      reportRuntime('renderer:build-missing', { rendererIndex }, 'error');
      throw new Error(`Renderer build not found: ${rendererIndex}`);
    }
    win.loadFile(rendererIndex).catch(e => {
      reportRuntime('renderer:load-failed', { rendererIndex, error: e.message }, 'error');
    });
  }

  setupIPC(win);

  // ── Auto Updater Events ──
  autoUpdater.on('update-available', (info) => {
    reportRuntime('updater:available', { version: info?.version || null });
    win.webContents.send('update:available', info);
  });

  autoUpdater.on('update-not-available', () => {
    reportRuntime('updater:not-available');
    win.webContents.send('update:not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    reportRuntime('updater:progress', { percent: Math.round(progress?.percent || 0) });
    win.webContents.send('update:progress', progress);
  });

  autoUpdater.on('update-downloaded', () => {
    reportRuntime('updater:downloaded');
    win.webContents.send('update:downloaded');
  });

  autoUpdater.on('error', (err) => {
    reportRuntime('updater:error', { error: err?.message || String(err) }, 'error');
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

app.on('second-instance', () => {
  const existing = BrowserWindow.getAllWindows()[0];
  if (!existing) return;
  if (existing.isMinimized()) existing.restore();
  existing.focus();
});

app.whenReady().then(() => {
  fs.mkdirSync(SESSION_DATA_PATH, { recursive: true });
  fs.mkdirSync(path.dirname(getDiagnosticsPath()), { recursive: true });
  createDiagnosticReporter()('app:ready', { packaged: app.isPackaged, sessionDataPath: SESSION_DATA_PATH });
  automationScheduler.start();
  createWindow();
});

app.on('window-all-closed', () => {
  createDiagnosticReporter()('app:window-all-closed');
  automationScheduler.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
