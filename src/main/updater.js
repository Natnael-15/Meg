/**
 * updater.js — Electron auto-updater integration.
 *
 * electron-updater looks for a `latest.yml` file attached as a release
 * asset on GitHub Releases.  If the release was created manually (e.g.
 * dragging a `.exe` into the GitHub UI), that file won't exist and the
 * updater will error with a 404.
 *
 * To publish correctly, run:
 *     npm run release        (builds + uploads installer AND latest.yml)
 *   OR
 *     npm run release:upload  (uploads dist/Meg-Setup.exe + dist/latest.yml
 *                              + dist/Meg-Setup.exe.blockmap to an existing
 *                              GitHub draft/tag release)
 */

// Keep a reference to the BrowserWindow so IPC handlers that are
// registered before the window exists can forward errors later.
let _win = null;

function attachUpdaterHandlers({
  autoUpdater,
  win,
  reportRuntime,
}) {
  _win = win;

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
    const raw = err?.message || String(err);
    // Make the 404 / latest.yml error human-friendly
    const message = raw.includes('latest.yml') || raw.includes('404')
      ? 'No update manifest found. The release may not have been published with electron-builder. Check GitHub Releases for a latest.yml asset.'
      : raw;
    reportRuntime('updater:error', { error: message }, 'error');
    win.webContents.send('update:error', message);
  });
}

function runScheduledUpdateCheck({
  autoUpdater,
  appRef,
  reportRuntime,
}) {
  if (!appRef?.isPackaged) {
    reportRuntime('updater:scheduled-check-skipped', { packaged: false });
    return false;
  }
  try {
    autoUpdater.checkForUpdatesAndNotify();
    reportRuntime('updater:scheduled-check-started');
    return true;
  } catch (error) {
    reportRuntime('updater:scheduled-check-failed', { error: error?.message || String(error) }, 'error');
    return false;
  }
}

function registerUpdaterIpc({
  ipcMain,
  autoUpdater,
  appRef,
  reportRuntime,
}) {
  ipcMain.on('update:check', () => {
    // Guard: don't run in dev mode — it will always fail
    if (appRef && !appRef.isPackaged) {
      const msg = 'Update check skipped: running in development mode.';
      reportRuntime('updater:manual-check-skipped', { packaged: false });
      if (_win) _win.webContents.send('update:error', msg);
      return;
    }
    try {
      autoUpdater.checkForUpdates();
      reportRuntime('updater:manual-check-started');
    } catch (error) {
      const msg = error?.message || String(error);
      reportRuntime('updater:manual-check-failed', { error: msg }, 'error');
      if (_win) _win.webContents.send('update:error', msg);
    }
  });

  ipcMain.on('update:download', () => {
    try {
      autoUpdater.downloadUpdate();
      reportRuntime('updater:download-started');
    } catch (error) {
      const msg = error?.message || String(error);
      reportRuntime('updater:download-failed', { error: msg }, 'error');
      if (_win) _win.webContents.send('update:error', msg);
    }
  });

  ipcMain.on('update:install', () => {
    try {
      autoUpdater.quitAndInstall();
      reportRuntime('updater:install-started');
    } catch (error) {
      const msg = error?.message || String(error);
      reportRuntime('updater:install-failed', { error: msg }, 'error');
      if (_win) _win.webContents.send('update:error', msg);
    }
  });
}

module.exports = {
  attachUpdaterHandlers,
  registerUpdaterIpc,
  runScheduledUpdateCheck,
};
