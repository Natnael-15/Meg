// @vitest-environment node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function loadDiagnosticsModule(appPath, consoleMocks = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../main/diagnostics.js'), 'utf8');
  const module = { exports: {} };
  const runModule = new Function('require', 'module', 'exports', '__dirname', '__filename', 'console', source);

  runModule((id) => {
    if (id === 'electron') {
      return { app: { getPath: () => appPath } };
    }
    if (id === 'fs') return require('fs');
    if (id === 'path') return require('path');
    throw new Error(`Unexpected module: ${id}`);
  }, module, module.exports, path.resolve(__dirname, '../../main'), path.resolve(__dirname, '../../main/diagnostics.js'), {
    log: consoleMocks.log || vi.fn(),
    error: consoleMocks.error || vi.fn(),
  });

  return module.exports;
}

describe('diagnostics', () => {
  let tempRoot;
  let diagnostics;
  let logMock;
  let errorMock;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meg-diagnostics-'));
    logMock = vi.fn();
    errorMock = vi.fn();
    diagnostics = loadDiagnosticsModule(tempRoot, { log: logMock, error: errorMock });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('writes runtime diagnostics to a jsonl file', () => {
    const report = diagnostics.createDiagnosticReporter();
    report('app:ready', { packaged: false });

    const logPath = diagnostics.getDiagnosticsPath();
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      type: 'app:ready',
      level: 'info',
      detail: { packaged: false },
    });
    expect(logMock).toHaveBeenCalled();
  });

  it('trims oversized diagnostic logs to the most recent retained lines', () => {
    const logPath = diagnostics.getDiagnosticsPath();
    const oversized = Array.from({ length: diagnostics.MAX_DIAGNOSTIC_LINES + 50 }, (_, index) =>
      JSON.stringify({ ts: `line-${index}`, type: `entry-${index}` })
    ).join('\n') + '\n';
    fs.writeFileSync(logPath, oversized + 'x'.repeat(diagnostics.MAX_DIAGNOSTIC_BYTES), 'utf8');

    diagnostics.trimDiagnosticFile(logPath);

    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(lines).toHaveLength(diagnostics.MAX_DIAGNOSTIC_LINES);
    expect(lines[0].type).toBe(`entry-50`);
    expect(lines.at(-1).type).toBe(`entry-${diagnostics.MAX_DIAGNOSTIC_LINES + 49}`);
  });

  it('attaches process diagnostics for uncaught exceptions and unhandled rejections', () => {
    const report = vi.fn();
    const processRef = new EventEmitter();
    processRef.removeListener = processRef.off.bind(processRef);
    const cleanup = diagnostics.attachProcessDiagnostics(report, { processRef });

    processRef.emit('uncaughtException', new Error('boom'));
    processRef.emit('unhandledRejection', new Error('reject'));

    expect(report).toHaveBeenCalledWith('process:uncaught-exception', expect.objectContaining({ message: 'boom' }), 'error');
    expect(report).toHaveBeenCalledWith('process:unhandled-rejection', expect.objectContaining({ message: 'reject' }), 'error');

    cleanup();
    expect(processRef.listenerCount('uncaughtException')).toBe(0);
    expect(processRef.listenerCount('unhandledRejection')).toBe(0);
  });

  it('attaches app diagnostics for child process crashes', () => {
    const report = vi.fn();
    const appRef = new EventEmitter();
    appRef.removeListener = appRef.off.bind(appRef);

    const cleanup = diagnostics.attachAppDiagnostics(report, { appRef });
    appRef.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed', exitCode: 1 });

    expect(report).toHaveBeenCalledWith('app:child-process-gone', {
      type: 'GPU',
      reason: 'crashed',
      exitCode: 1,
    }, 'error');

    cleanup();
    expect(appRef.listenerCount('child-process-gone')).toBe(0);
  });

  it('attaches window diagnostics for renderer failures and responsiveness', () => {
    const report = vi.fn();
    const win = new EventEmitter();
    win.webContents = new EventEmitter();
    win.webContents.getURL = () => 'http://127.0.0.1:5173';

    diagnostics.attachWindowDiagnostics(win, report);

    win.emit('ready-to-show');
    win.emit('unresponsive');
    win.emit('responsive');
    win.webContents.emit('did-finish-load');
    win.webContents.emit('console-message', {}, 2, 'warn message', 42, 'src/app.js');
    win.webContents.emit('console-message', {}, 3, 'error message', 44, 'src/app.js');
    win.webContents.emit('did-fail-load', {}, -1, 'load failed', 'http://127.0.0.1:5173', true);
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });

    expect(report).toHaveBeenCalledWith('window:ready-to-show');
    expect(report).toHaveBeenCalledWith('window:unresponsive', {}, 'error');
    expect(report).toHaveBeenCalledWith('window:responsive');
    expect(report).toHaveBeenCalledWith('renderer:did-finish-load', { url: 'http://127.0.0.1:5173' });
    expect(report).toHaveBeenCalledWith('renderer:console-message', {
      level: 2,
      message: 'warn message',
      lineNumber: 42,
      sourceId: 'src/app.js',
    }, 'info');
    expect(report).toHaveBeenCalledWith('renderer:console-message', {
      level: 3,
      message: 'error message',
      lineNumber: 44,
      sourceId: 'src/app.js',
    }, 'error');
    expect(report).toHaveBeenCalledWith('renderer:did-fail-load', {
      errorCode: -1,
      errorDescription: 'load failed',
      validatedURL: 'http://127.0.0.1:5173',
      isMainFrame: true,
    }, 'error');
    expect(report).toHaveBeenCalledWith('renderer:process-gone', { reason: 'crashed', exitCode: 1 }, 'error');
  });

  it('reads recent valid diagnostics and skips malformed lines', () => {
    const logPath = diagnostics.getDiagnosticsPath();
    fs.writeFileSync(logPath, [
      JSON.stringify({ ts: '2026-04-29T12:00:00.000Z', type: 'first' }),
      'not-json',
      JSON.stringify({ ts: '2026-04-29T12:01:00.000Z', type: 'second' }),
    ].join('\n') + '\n', 'utf8');

    expect(diagnostics.readRecentDiagnostics(10)).toEqual([
      { ts: '2026-04-29T12:01:00.000Z', type: 'second' },
      { ts: '2026-04-29T12:00:00.000Z', type: 'first' },
    ]);
  });
});
