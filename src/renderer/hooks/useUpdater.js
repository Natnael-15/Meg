import { useState, useEffect, useCallback } from 'react';

/**
 * Encapsulates the auto-updater lifecycle:
 *  - `updateInfo` state machine: null → 'available' → 'downloading' (with %)
 *    → 'ready' (restart to install) | 'error' | 'not-available'
 *  - `isCheckingUpdate` flag for the settings UI spinner
 *  - `triggerUpdateCheck()` to manually kick off a check
 *  - Wires all 5 IPC event listeners (available / not-available / progress /
 *    downloaded / error) once on mount.
 *
 * The 10-second timeout on `isCheckingUpdate` ensures the spinner doesn't
 * spin forever if the IPC layer never responds (e.g. dev mode, offline).
 */
export function useUpdater() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const triggerUpdateCheck = useCallback(() => {
    setIsCheckingUpdate(true);
    window.electronAPI?.checkForUpdates();
    // Safety timeout — if the updater IPC never responds (dev mode, offline,
    // or the GitHub release endpoint is unreachable), clear the spinner
    // after 10 seconds so the settings UI doesn't appear stuck.
    setTimeout(() => setIsCheckingUpdate(false), 10000);
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    const api = window.electronAPI;
    api.onUpdateAvailable((info) => {
      setIsCheckingUpdate(false);
      setUpdateInfo({ version: info.version, status: 'available', progress: 0 });
    });
    api.onUpdateNotAvailable(() => {
      setIsCheckingUpdate(false);
      setUpdateInfo({ status: 'not-available' });
    });
    api.onUpdateProgress((prog) => setUpdateInfo((prev) => ({ ...prev, status: 'downloading', progress: Math.round(prog.percent) })));
    api.onUpdateDownloaded(() => setUpdateInfo((prev) => ({ ...prev, status: 'ready' })));
    api.onUpdateError((err) => {
      setIsCheckingUpdate(false);
      // Keep this console.error — the settings UI surfaces the error state,
      // but the dev console is the only place to see the raw error payload
      // (network body, stack trace, etc.) during debugging.
      console.error('Update error:', err);
      setUpdateInfo({ status: 'error', error: err });
    });
    // Note: the preload bridge registers these as ipcRenderer.on() listeners
    // without returning unsubscribers, so we can't cleanly remove them on
    // unmount. This hook is only ever mounted once at the App root, so the
    // leak is bounded.
  }, []);

  return { updateInfo, isCheckingUpdate, triggerUpdateCheck };
}
