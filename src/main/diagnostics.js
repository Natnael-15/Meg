const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX_DIAGNOSTIC_BYTES = 1024 * 1024;
const MAX_DIAGNOSTIC_LINES = 1000;

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
  const diagnosticsPath = getDiagnosticsPath();
  fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(diagnosticsPath, line, 'utf8');
  trimDiagnosticFile(diagnosticsPath);
}

function trimDiagnosticFile(diagnosticsPath = getDiagnosticsPath()) {
  try {
    const stat = fs.statSync(diagnosticsPath);
    if (stat.size <= MAX_DIAGNOSTIC_BYTES) return;
    const lines = fs.readFileSync(diagnosticsPath, 'utf8').split('\n');
    const retained = [];
    for (let index = lines.length - 1; index >= 0 && retained.length < MAX_DIAGNOSTIC_LINES; index -= 1) {
      const line = lines[index].trim();
      if (!line) continue;
      try {
        JSON.parse(line);
        retained.push(line);
      } catch {
        // Skip malformed trailing content rather than preserving it.
      }
    }
    retained.reverse();
    fs.writeFileSync(diagnosticsPath, retained.join('\n') + (retained.length ? '\n' : ''), 'utf8');
  } catch {
    // Diagnostics should never crash the app.
  }
}

function readRecentDiagnostics(limit = 100, diagnosticsPath = getDiagnosticsPath()) {
  try {
    if (!fs.existsSync(diagnosticsPath)) return [];
    const lines = fs.readFileSync(diagnosticsPath, 'utf8').split('\n');
    const parsed = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      try {
        parsed.push(JSON.parse(line));
      } catch {
        // Skip malformed lines rather than failing diagnostics visibility.
      }
    }
    const safeLimit = Math.max(1, Number(limit) || 100);
    return parsed.slice(-safeLimit).reverse();
  } catch {
    return [];
  }
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

function attachAppDiagnostics(report, { appRef = app } = {}) {
  const onChildProcessGone = (_event, details) => {
    report('app:child-process-gone', details || {}, 'error');
  };

  appRef.on('child-process-gone', onChildProcessGone);

  return () => {
    appRef.removeListener('child-process-gone', onChildProcessGone);
  };
}

function attachWindowDiagnostics(win, report) {
  win.on('unresponsive', () => report('window:unresponsive', {}, 'error'));
  win.on('responsive', () => report('window:responsive'));
  win.on('ready-to-show', () => report('window:ready-to-show'));

  win.webContents.on('did-finish-load', () => {
    report('renderer:did-finish-load', { url: win.webContents.getURL?.() || null });
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    report('renderer:did-fail-load', { errorCode, errorDescription, validatedURL, isMainFrame }, 'error');
  });

  win.webContents.on('console-message', (_event, level, message, lineNumber, sourceId) => {
    if (level < 2) return;
    report('renderer:console-message', {
      level,
      message,
      lineNumber,
      sourceId,
    }, level >= 3 ? 'error' : 'info');
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    report('renderer:process-gone', details || {}, 'error');
  });
}

module.exports = {
  MAX_DIAGNOSTIC_BYTES,
  MAX_DIAGNOSTIC_LINES,
  attachAppDiagnostics,
  attachProcessDiagnostics,
  attachWindowDiagnostics,
  createDiagnosticReporter,
  getDiagnosticsPath,
  normalizeError,
  readRecentDiagnostics,
  trimDiagnosticFile,
};
