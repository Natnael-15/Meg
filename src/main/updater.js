function attachUpdaterHandlers({
  autoUpdater,
  win,
  reportRuntime,
}) {
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
    const message = err?.message || String(err);
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
  reportRuntime,
}) {
  ipcMain.on('update:check', () => {
    try {
      autoUpdater.checkForUpdates();
      reportRuntime('updater:manual-check-started');
    } catch (error) {
      reportRuntime('updater:manual-check-failed', { error: error?.message || String(error) }, 'error');
    }
  });

  ipcMain.on('update:download', () => {
    try {
      autoUpdater.downloadUpdate();
      reportRuntime('updater:download-started');
    } catch (error) {
      reportRuntime('updater:download-failed', { error: error?.message || String(error) }, 'error');
    }
  });

  ipcMain.on('update:install', () => {
    try {
      autoUpdater.quitAndInstall();
      reportRuntime('updater:install-started');
    } catch (error) {
      reportRuntime('updater:install-failed', { error: error?.message || String(error) }, 'error');
    }
  });
}

module.exports = {
  attachUpdaterHandlers,
  registerUpdaterIpc,
  runScheduledUpdateCheck,
};
