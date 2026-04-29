const { app } = require('electron');
const fs = require('fs');
const path = require('path');

function getDiagnosticsPath() {
  const userData = app?.getPath ? app.getPath('userData') : process.cwd();
  return path.join(userData, 'meg-runtime.jsonl');
}

function normalizeError(error) {
  if (!error) return null;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (typeof error === 'object') return error;
  return { message: String(error) };
}

function writeDiagnostic(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(getDiagnosticsPath(), line, 'utf8');
}

function createDiagnosticReporter(win) {
  return (type, detail = {}, level = 'info') => {
    const entry = { type, level, detail };
    try {
      writeDiagnostic(entry);
    } catch {
      // Diagnostics should never crash the app.
    }
    if (level === 'error') {
      console.error(`[runtime:${type}]`, detail);
    } else {
      console.log(`[runtime:${type}]`, detail);
    }
    if (win && !win.isDestroyed?.() && win.webContents && !win.webContents.isDestroyed?.()) {
      win.webContents.send('runtime:diagnostic', { ts: new Date().toISOString(), ...entry });
    }
  };
}

function attachProcessDiagnostics(report, { processRef = process } = {}) {
  const onUncaughtException = (error) => report('process:uncaught-exception', normalizeError(error), 'error');
  const onUnhandledRejection = (reason) => report('process:unhandled-rejection', normalizeError(reason), 'error');

  processRef.on('uncaughtException', onUncaughtException);
  processRef.on('unhandledRejection', onUnhandledRejection);

  return () => {
    processRef.removeListener('uncaughtException', onUncaughtException);
    processRef.removeListener('unhandledRejection', onUnhandledRejection);
  };
}

function attachWindowDiagnostics(win, report) {
  win.on('unresponsive', () => report('window:unresponsive', {}, 'error'));
  win.on('responsive', () => report('window:responsive'));

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    report('renderer:did-fail-load', { errorCode, errorDescription, validatedURL, isMainFrame }, 'error');
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    report('renderer:process-gone', details || {}, 'error');
  });
}

module.exports = {
  attachProcessDiagnostics,
  attachWindowDiagnostics,
  createDiagnosticReporter,
  getDiagnosticsPath,
  normalizeError,
};
