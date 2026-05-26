// @vitest-environment node

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';

function loadUpdaterModule() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/updater.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', source);

  runModule((id) => {
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/updater.js'));

  return module.exports;
}

describe('updater helpers', () => {
  it('forwards updater lifecycle events to diagnostics and renderer ipc', () => {
    const updater = loadUpdaterModule();
    const autoUpdater = new EventEmitter();
    const reportRuntime = vi.fn();
    const win = { webContents: { send: vi.fn() } };

    updater.attachUpdaterHandlers({ autoUpdater, win, reportRuntime });

    autoUpdater.emit('update-available', { version: '0.6.0' });
    autoUpdater.emit('download-progress', { percent: 42.3 });
    autoUpdater.emit('update-downloaded');
    autoUpdater.emit('error', new Error('Network unavailable'));

    expect(reportRuntime).toHaveBeenCalledWith('updater:available', { version: '0.6.0' });
    expect(reportRuntime).toHaveBeenCalledWith('updater:progress', { percent: 42 });
    expect(reportRuntime).toHaveBeenCalledWith('updater:downloaded');
    expect(reportRuntime).toHaveBeenCalledWith('updater:error', { error: 'Network unavailable' }, 'error');
    expect(win.webContents.send).toHaveBeenCalledWith('update:available', { version: '0.6.0' });
    expect(win.webContents.send).toHaveBeenCalledWith('update:progress', { percent: 42.3 });
    expect(win.webContents.send).toHaveBeenCalledWith('update:downloaded');
    expect(win.webContents.send).toHaveBeenCalledWith('update:error', 'Network unavailable');
  });

  it('runs scheduled update checks only for packaged builds', () => {
    const updater = loadUpdaterModule();
    const reportRuntime = vi.fn();
    const autoUpdater = {
      checkForUpdatesAndNotify: vi.fn(),
    };

    expect(updater.runScheduledUpdateCheck({
      autoUpdater,
      appRef: { isPackaged: false },
      reportRuntime,
    })).toBe(false);
    expect(autoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
    expect(reportRuntime).toHaveBeenCalledWith('updater:scheduled-check-skipped', { packaged: false });

    expect(updater.runScheduledUpdateCheck({
      autoUpdater,
      appRef: { isPackaged: true },
      reportRuntime,
    })).toBe(true);
    expect(autoUpdater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(1);
    expect(reportRuntime).toHaveBeenCalledWith('updater:scheduled-check-started');
  });

  it('registers manual updater ipc controls with failure diagnostics', () => {
    const updater = loadUpdaterModule();
    const reportRuntime = vi.fn();
    const onMap = new Map();
    const ipcMain = {
      on: (channel, handler) => onMap.set(channel, handler),
    };
    const autoUpdater = {
      checkForUpdates: vi.fn(() => { throw new Error('check failed'); }),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn(() => { throw new Error('install failed'); }),
    };

    updater.registerUpdaterIpc({ ipcMain, autoUpdater, reportRuntime });

    onMap.get('update:check')();
    onMap.get('update:download')();
    onMap.get('update:install')();

    expect(reportRuntime).toHaveBeenCalledWith('updater:manual-check-failed', { error: 'check failed' }, 'error');
    expect(reportRuntime).toHaveBeenCalledWith('updater:download-started');
    expect(reportRuntime).toHaveBeenCalledWith('updater:install-failed', { error: 'install failed' }, 'error');
  });
});
