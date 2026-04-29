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

  it('attaches window diagnostics for renderer failures and responsiveness', () => {
    const report = vi.fn();
    const win = new EventEmitter();
    win.webContents = new EventEmitter();

    diagnostics.attachWindowDiagnostics(win, report);

    win.emit('unresponsive');
    win.emit('responsive');
    win.webContents.emit('did-fail-load', {}, -1, 'load failed', 'http://127.0.0.1:5173', true);
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });

    expect(report).toHaveBeenCalledWith('window:unresponsive', {}, 'error');
    expect(report).toHaveBeenCalledWith('window:responsive');
    expect(report).toHaveBeenCalledWith('renderer:did-fail-load', {
      errorCode: -1,
      errorDescription: 'load failed',
      validatedURL: 'http://127.0.0.1:5173',
      isMainFrame: true,
    }, 'error');
    expect(report).toHaveBeenCalledWith('renderer:process-gone', { reason: 'crashed', exitCode: 1 }, 'error');
  });
});
