const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { setupIPC } = require('./ipc');
const automationScheduler = require('./automationScheduler');
const { showRecoveryPage } = require('./recovery');
const { loadRendererSurface } = require('./startup');
const {
  attachUpdaterHandlers,
  registerUpdaterIpc,
  runScheduledUpdateCheck,
} = require('./updater');
const {
  attachAppDiagnostics,
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
attachAppDiagnostics(createDiagnosticReporter());

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
    show: true,
  });
  const reportRuntime = createDiagnosticReporter(win);
  attachWindowDiagnostics(win, reportRuntime);
  reportRuntime('window:created', { packaged: app.isPackaged, diagnosticsPath: getDiagnosticsPath() });

  // Toggle DevTools with F12
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      win.webContents.toggleDevTools();
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
  const rendererIndex = path.join(__dirname, '../../dist/renderer/index.html');
  loadRendererSurface(win, reportRuntime, {
    appRef: app,
    devServerUrl,
    rendererIndex,
    diagnosticsPath: getDiagnosticsPath(),
    showRecoveryPage,
  }).catch((error) => {
    reportRuntime('renderer:recovery-load-failed', { error: error?.message || String(error) }, 'error');
  });

  setupIPC(win);

  attachUpdaterHandlers({
    autoUpdater,
    win,
    reportRuntime,
  });

  // Check for updates after 3 seconds
  setTimeout(() => {
    runScheduledUpdateCheck({
      autoUpdater,
      appRef: app,
      reportRuntime,
    });
  }, 3000);
}

registerUpdaterIpc({
  ipcMain,
  autoUpdater,
  appRef: app,
  reportRuntime: createDiagnosticReporter(),
});

app.on('second-instance', () => {
  const existing = BrowserWindow.getAllWindows()[0];
  if (!existing) {
    createWindow();
    return;
  }
  if (existing.isMinimized()) existing.restore();
  existing.show();
  existing.focus();
});

app.whenReady().then(() => {
  fs.mkdirSync(SESSION_DATA_PATH, { recursive: true });
  fs.mkdirSync(path.dirname(getDiagnosticsPath()), { recursive: true });
  createDiagnosticReporter()('app:ready', { packaged: app.isPackaged, sessionDataPath: SESSION_DATA_PATH });
  automationScheduler.start();
  createWindow();
  // Ensure the custom skills directory exists so users can drop skill JSON
  // files in. Safe to call every startup — it's a no-op if the dir exists.
  try { require('./customSkills').ensureSkillsDir(); } catch {}
  // Connect to configured MCP servers in the background. Errors are logged
  // via the mcp 'log' event but never block app startup.
  require('./mcpClient').connectAll().catch(() => {});
});

app.on('window-all-closed', () => {
  createDiagnosticReporter()('app:window-all-closed');
  automationScheduler.stop();
  require('./mcpClient').disconnectAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
